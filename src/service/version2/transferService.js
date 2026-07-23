// import mongoose from 'mongoose';
// import User from '../../models/users.js';
// import History from '../../models/history.js';
// import { paystackService } from './paystackService.js';
// import { updateRevenue } from '../../utils/revenue.js';
// import { CONFIG } from '../../utils/version2/constants.js';
// import { generateTransactionReference } from '../../utils/version2/helpers.js';









import mongoose from 'mongoose';
import User from '../../models/users.js';
import History from '../../models/history.js';
import { paystackService } from './paystackService.js';
import { updateRevenue } from  "../../utils/revenue.js"
import { CONFIG } from '../../utils/version2/constants.js';
import { generateTransactionReference, PerformanceMonitor } from '../../utils/version2/helpers.js';
import { TransferError, InsufficientBalanceError } from '../../utils/version2/errors.js';

export class TransferService {
  async rollbackBalance(email, amount, session = null) {
    try {
      const options = { maxTimeMS: CONFIG.DB_TIMEOUT };
      if (session) options.session = session;

      const result = await User.findOneAndUpdate(
        { email },
        { $inc: { balance: amount } },
        options
      );

      if (!result) {
        console.error('Balance rollback failed - user not found:', { email, amount });
      } else {
        console.log('Balance rolled back successfully:', { email, amount });
      }
    } catch (error) {
      console.error('Balance rollback failed:', { email, amount, error: error.message });
    }
  }

  async deductUserBalance(user, totalDeduction, session) {
    PerformanceMonitor.start('balance_deduction');
    
    const updatedUser = await User.findOneAndUpdate(
      { 
        _id: user._id,
        balance: { $gte: totalDeduction }
      },
      { 
        $inc: { balance: -totalDeduction },
        $set: { lastTransaction: new Date() }
      },
      { 
        new: true, 
        session,
        maxTimeMS: CONFIG.DB_TIMEOUT
      }
    );

    PerformanceMonitor.end('balance_deduction');

    if (!updatedUser) {
      throw new InsufficientBalanceError('Concurrent transaction detected or balance changed');
    }

    return updatedUser;
  }

  async recordTransactionHistory(transferData, user, session) {
    PerformanceMonitor.start('record_history');
    
    const {
      name,
      account_number,
      amount,
      fee,
      destinationBankName,
      transferResult,
      recipient,
      transactionId
    } = transferData;

    const transactionReference = generateTransactionReference();
    
    await History.create(
      [{
        userId: user._id,
        service: 'BANK_TRANSFER',
        amount,
        transactionReference,
        recipientName: name,
        type: 'DEBIT',
        senderBank: 'WALLET',
        status: transferResult.success ? 'SUCCESS' : 'FAILED',
        destinationBankName,
        account_number,
        name,
        fee,
        additionalData: {
          transferCode: transferResult.data?.transfer_code,
          recipientCode: recipient.recipient_code,
          email: user.email,
          transactionId,
          paystackMessage: transferResult.message
        },
      }],
      { session }
    );

    PerformanceMonitor.end('record_history');
    return transactionReference;
  }

  async processTransfer(transferData, user, session) {
    let transactionCommitted = false;
    
    try {
      PerformanceMonitor.start('paystack_recipient_creation');
      const recipient = await paystackService.createRecipient(
        transferData.name, 
        transferData.account_number, 
        transferData.bank_code
      );
      PerformanceMonitor.end('paystack_recipient_creation');

      PerformanceMonitor.start('paystack_transfer_initiation');
      const transferResult = await paystackService.initiateTransfer(
        transferData.amount, 
        recipient.recipient_code, 
        transferData.reason
      );
      PerformanceMonitor.end('paystack_transfer_initiation');

      if (!transferResult.success) {
        throw new TransferError('Transaction failed. Please try again later.');
      }

      PerformanceMonitor.start('record_transaction');
      const transactionReference = await this.recordTransactionHistory(
        { ...transferData, transferResult, recipient },
        user,
        session
      );
      PerformanceMonitor.end('record_transaction');

      if (transferData.fee > 0) {
        await updateRevenue('TRANSFER', transferData.fee, { session });
      }

      await session.commitTransaction();
      transactionCommitted = true;

      return {
        transactionReference,
        transferResult,
        newBalance: user.balance - transferData.totalDeduction
      };

    } catch (error) {
      if (session.inTransaction() && !transactionCommitted) {
        await session.abortTransaction();
      }
      
      // Rollback user balance if Paystack operation failed
      if (!transactionCommitted && error instanceof TransferError) {
        await this.rollbackBalance(user.email, transferData.totalDeduction);
      }
      
      throw error;
    }
  }
}

export const transferService = new TransferService();