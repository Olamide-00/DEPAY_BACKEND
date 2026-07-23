import JobQueue from '../models/JobQueue.js';
import History from '../models/history.js';
import { sendTransactionNotification } from '../service/emailService/transferNotification.js';
import { updateRevenue } from '../../../utils/revenue.js';
import { CONFIG, JOB_TYPES, JOB_STATUS } from '../utils/constants.js';
import { createReservedAccount } from '../service/payverve/reservedAccount.js';
import User from '../../../models/User.js';

export class QueueWorker {
  constructor() {
    this.isProcessing = false;
    this.processingJobs = new Set();
    this.intervalId = null;
  }

  async processSingleJob(job) {
    // Prevent duplicate processing
    if (this.processingJobs.has(job._id.toString())) {
      return { success: false, reason: 'already_processing' };
    }
    
    this.processingJobs.add(job._id.toString());
    
    try {
      if (job.attempts >= job.maxAttempts) {
        await JobQueue.findByIdAndUpdate(job._id, {
          status: JOB_STATUS.FAILED,
          processedAt: new Date(),
          error: 'Max attempts exceeded'
        });
        return { success: false, reason: 'max_attempts' };
      }

      await JobQueue.findByIdAndUpdate(job._id, {
        status: JOB_STATUS.PROCESSING,
        $inc: { attempts: 1 }
      });

      console.log(`Processing job ${job._id} (attempt ${job.attempts + 1})`);

      switch (job.type) {
        case JOB_TYPES.EMAIL_NOTIFICATION:
          const { email, transactionType, amount, transactionId, timestamp, userName } = job.data;
          await sendTransactionNotification(
            email, 
            transactionType, 
            amount, 
            transactionId, 
            timestamp, 
            userName
          );
          break;
        
        case JOB_TYPES.TRANSACTION_HISTORY:
          await History.create(job.data);
          break;
        
        case JOB_TYPES.REVENUE_UPDATE:
          const { type, amount: revenueAmount } = job.data;
          await updateRevenue(type, revenueAmount);
          break;
        
        // ADD THIS NEW CASE FOR RESERVED ACCOUNT CREATION
        case JOB_TYPES.RESERVED_ACCOUNT_CREATION:
          await this.processReservedAccountCreation(job);
          break;
        
        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      await JobQueue.findByIdAndUpdate(job._id, {
        status: JOB_STATUS.COMPLETED,
        processedAt: new Date()
      });

      console.log(`Job ${job._id} completed successfully`);
      return { success: true };

    } catch (processingError) {
      console.error(`Job ${job._id} processing failed:`, processingError.message);

      const nextRetry = new Date();
      const backoffSeconds = Math.min(
        Math.pow(2, job.attempts) * 5,
        CONFIG.MAX_RETRY_DELAY
      );
      nextRetry.setSeconds(nextRetry.getSeconds() + backoffSeconds);

      const updateData = {
        error: processingError.message,
        processedAt: new Date()
      };

      if (job.attempts + 1 >= job.maxAttempts) {
        updateData.status = JOB_STATUS.FAILED;
        console.log(`Job ${job._id} marked as FAILED after ${job.attempts + 1} attempts`);
      } else {
        updateData.status = JOB_STATUS.PENDING;
        updateData.nextRetry = nextRetry;
        console.log(`Job ${job._id} scheduled for retry at ${nextRetry.toISOString()}`);
      }

      await JobQueue.findByIdAndUpdate(job._id, updateData);
      return { success: false, reason: 'processing_error' };
    } finally {
      this.processingJobs.delete(job._id.toString());
    }
  }

  // ADD THIS NEW METHOD FOR PROCESSING RESERVED ACCOUNTS
  async processReservedAccountCreation(job) {
    const { accountData, userId } = job.data;

    console.log('Processing reserved account creation', {
      jobId: job._id,
      userId,
      email: accountData.email,
      attempt: job.attempts + 1
    });

    // Set default values (maintaining your initial logic)
    const processedData = {
      ...accountData,
      preferred_bank: "wema-bank",
      country: "NG"
    };

    // Create reserved account (your original function)
    const response = await createReservedAccount(processedData);

    // Update user wallet creation status (your original logic)
    const updateUser = await User.findOneAndUpdate(
      { email: accountData.email },
      { isWalletCreated: true },
      { new: true }
    );

    if (!updateUser) {
      throw new Error(`User with email ${accountData.email} not found`);
    }

    console.log('Reserved account created successfully', {
      jobId: job._id,
      userId,
      email: accountData.email
    });

    return response.data;
  }

  async processJobQueue() {
    try {
      const eligibleJobs = await JobQueue.find({
        status: JOB_STATUS.PENDING,
        nextRetry: { $lte: new Date() }
      })
      .sort({ priority: 1, nextRetry: 1 })
      .limit(CONFIG.BATCH_SIZE)
      .lean();

      if (eligibleJobs.length === 0) {
        return { processed: false, count: 0 };
      }

      console.log(`Found ${eligibleJobs.length} jobs to process`);

      const results = [];
      for (const job of eligibleJobs) {
        const result = await this.processSingleJob(job);
        results.push(result);
      }

      const successfulJobs = results.filter(r => r.success).length;
      const failedJobs = results.filter(r => !r.success).length;

      console.log(`Batch processing complete: ${successfulJobs} successful, ${failedJobs} failed`);

      return { 
        processed: true, 
        count: eligibleJobs.length,
        successful: successfulJobs,
        failed: failedJobs
      };

    } catch (error) {
      console.error('Queue processing error:', error.message);
      return { processed: false, error: error.message };
    }
  }

  start() {
    if (this.intervalId) {
      console.log('Worker already started');
      return;
    }

    this.intervalId = setInterval(async () => {
      if (this.isProcessing) return;
      this.isProcessing = true;

      try {
        await this.processJobQueue();
      } catch (error) {
        console.error('Worker batch error:', error.message);
      } finally {
        this.isProcessing = false;
      }
    }, CONFIG.PROCESSING_INTERVAL);

    console.log('Background job worker started successfully');
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Background job worker stopped');
    }
  }

  setupGracefulShutdown() {
    const shutdown = async () => {
      console.log('Shutting down queue worker gracefully...');
      this.stop();
      
      // Wait for current processing to complete
      let attempts = 0;
      while ((this.isProcessing || this.processingJobs.size > 0) && attempts < 30) {
        console.log(`Waiting for ${this.processingJobs.size} jobs to complete...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }
      
      console.log('Queue worker shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }

  // Health check method
  async getHealth() {
    try {
      const stats = await JobQueue.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            oldest: { $min: '$createdAt' },
            newest: { $max: '$createdAt' }
          }
        }
      ]);

      const failedJobs = await JobQueue.countDocuments({
        status: JOB_STATUS.FAILED,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });

      return {
        healthy: failedJobs < 10,
        stats,
        totalFailedLast24h: failedJobs,
        isRunning: this.intervalId !== null,
        currentlyProcessing: this.processingJobs.size,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

export const queueWorker = new QueueWorker();