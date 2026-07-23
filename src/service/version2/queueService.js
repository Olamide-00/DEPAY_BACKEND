import JobQueue from '../../models/version2/queue.js';
import History from '../../models/history.js';
import { sendTransactionNotification } from '../../service/emailService/transferNotification.js';
import { updateRevenue } from '../../utils/revenue.js';
import { JOB_TYPES } from '../../utils/version2/constants.js';

export class QueueService {
  validateJobData(type, data) {
    const validators = {
      [JOB_TYPES.EMAIL_NOTIFICATION]: (data) => {
        if (!data.email || !data.transactionId) {
          throw new Error('Invalid email notification job data');
        }
      },
      [JOB_TYPES.TRANSACTION_HISTORY]: (data) => {
        if (!data.userId || data.amount == null) {
          throw new Error('Invalid transaction history job data');
        }
      },
      [JOB_TYPES.REVENUE_UPDATE]: (data) => {
        if (!data.type || data.amount == null) {
          throw new Error('Invalid revenue update job data');
        }
      }
    };

    const validator = validators[type];
    if (validator) {
      validator(data);
    }
  }

  async queueJob(type, data, priority = 1) {
    try {
      this.validateJobData(type, data);
      
      const job = await JobQueue.create({
        type,
        data,
        priority,
        nextRetry: new Date()
      });
      
      console.log(`Job queued successfully: ${type}`, { jobId: job._id });
      return job;
    } catch (error) {
      console.error('Failed to queue job:', error.message);
      throw error;
    }
  }

  async queueTransferJobs(transferData, user) {
    const { email, amount, name, destinationBankName, fee, transactionReference } = transferData;
    
    try {
      await Promise.all([
        this.queueJob(JOB_TYPES.EMAIL_NOTIFICATION, {
          email,
          transactionType: 'Transfer',
          amount,
          transactionId: transactionReference,
          timestamp: new Date().toISOString(),
          userName: user.name,
          recipientName: name,
          bankName: destinationBankName
        }, 3),

        this.queueJob(JOB_TYPES.TRANSACTION_HISTORY, {
          userId: user._id,
          service: 'BANK_TRANSFER',
          amount,
          transactionReference,
          recipientName: user.name || 'unknown',
          type: 'DEBIT',
          senderBank: 'WALLET',
          status: 'SUCCESS',
          destinationBankName,
          account_number: transferData.account_number,
          name,
          fee,
          additionalData: { email, transactionId: transferData.transactionId }
        }, 2),

        this.queueJob(JOB_TYPES.REVENUE_UPDATE, {
          type: 'TRANSFER',
          amount: fee
        }, 1)
      ]);
      
      console.log('All background jobs queued successfully');
    } catch (error) {
      console.error('Some background jobs failed to queue:', error.message);
    }
  }
}

export const queueService = new QueueService();