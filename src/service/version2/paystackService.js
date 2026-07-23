import axios from 'axios';
import { CONFIG } from '../../utils/version2/constants.js';
import { TransferError } from '../../utils/version2/errors.js';

export class PaystackService {
  constructor() {
    this.baseURL = process.env.URL;
    this.secretKey = process.env.SECRET_KEY;
  }

  async createRecipient(name, account_number, bank_code) {
    try {
      console.log('Creating Paystack recipient...', { 
        name: name?.substring(0, 20), 
        account_number, 
        bank_code 
      });
      
      const response = await axios.post(
        `${this.baseURL}/transferrecipient`,
        {
          type: 'nuban',
          name: String(name || '').trim().substring(0, 100),
          account_number: String(account_number || '').trim(),
          bank_code: String(bank_code || '').trim(),
          currency: CONFIG.CURRENCY,
        },
        {
          headers: this.getHeaders(),
          timeout: 15000,
        }
      );

      if (!response.data?.status || !response.data?.data) {
        throw new Error(`Recipient creation failed: ${response.data?.message || 'Unknown error'}`);
      }

      console.log('Recipient created successfully:', response.data.data.recipient_code);
      return response.data.data;
    } catch (error) {
      console.error('Paystack recipient creation failed:', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      
      if (error.code === 'ECONNABORTED') {
        throw new TransferError('Transaction failed. Please try again later.');
      }
      throw new TransferError('Transaction failed. Please try again later.');
    }
  }

  async initiateTransfer(amount, recipientCode, reason) {
    try {
      console.log('Initiating Paystack transfer...', { amount, recipientCode });
      
      const response = await axios.post(
        `${this.baseURL}/transfer`,
        {
          source: 'balance',
          amount: Math.round(amount * CONFIG.KOBO_MULTIPLIER),
          recipient: recipientCode,
          reason: String(reason || 'Transfer').substring(0, 255),
        },
        {
          headers: this.getHeaders(),
          timeout: 20000,
        }
      );

      const result = {
        success: response.data?.status === true,
        data: response.data?.data,
        message: response.data?.message,
        fullResponse: response.data
      };

      if (result.success) {
        console.log('Transfer initiated successfully:', result.data.transfer_code);
      } else {
        console.warn('Transfer initiation response indicates failure:', result.message);
      }

      return result;
    } catch (error) {
      console.error('Paystack transfer initiation failed:', {
        error: error.message,
        status: error.response?.status,
        paystackError: error.response?.data,
        recipientCode
      });
      
      // Convert all Paystack errors to generic error
      if (error.response?.data?.code === 'insufficient_balance' || error.code === 'ECONNABORTED') {
        throw new TransferError('Transaction failed. Please try again later.');
      }
      throw new TransferError('Transaction failed. Please try again later.');
    }
  }

  getHeaders() {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }
}

export const paystackService = new PaystackService();