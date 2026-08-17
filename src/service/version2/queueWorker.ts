import JobQueue, { type IJobQueue, type JobQueueDocument } from '../../models/version2/queue.js';
import History from '../../models/history.js';
import { sendTransactionNotification } from '../emailService/transferNotification.js';
import { updateRevenue } from '../../utils/revenue.js';
import { CONFIG, JOB_TYPES, JOB_STATUS } from '../../utils/version2/constants.js';
import { createReservedAccount } from './walletService/createReserveAccount.js';
import { sendPushNotification } from '../../controller/version2/pushNotification/pushNotification.js';
import User from '../../models/users.js';
import type { RevenueType } from '../../models/revenue.js';

// ══════════════════════════════════════════════════════════════════
// Background job worker
//
// This file existed in the repo already but was completely dead: it
// was never started anywhere (no `.start()` call), and every one of
// its imports pointed at the wrong path or a module that doesn't
// exist (`../models/JobQueue.js`, `../../../models/User.js`,
// `../service/payverve/reservedAccount.js`, etc.) — importing it at
// all would have thrown `ERR_MODULE_NOT_FOUND` immediately. Fixed the
// paths, added a PUSH_NOTIFICATION job type (Expo push calls were
// previously fire-and-forget with zero retry — see
// pushNotification.ts), and wired `.start()` into app.ts.
//
// Polls the JobQueue collection on an interval, claims a small batch
// of due jobs, and processes them with exponential backoff on
// failure (up to `maxAttempts`, default 3). This is a simple
// MongoDB-backed queue — good enough at 1000-user scale (a single
// indexed `find + limit` poll every couple seconds is cheap), but if
// you outgrow it, the natural next step is a real broker (BullMQ +
// Redis) — the job shape here (`type`, `data`, `attempts`,
// `nextRetry`) would map over directly.
// ══════════════════════════════════════════════════════════════════

interface JobResult {
  success: boolean;
  reason?: string;
}

export class QueueWorker {
  private isProcessing = false;
  private processingJobs = new Set<string>();
  private intervalId: NodeJS.Timeout | null = null;

  async processSingleJob(job: IJobQueue & { _id: unknown }): Promise<JobResult> {
    const jobId = String(job._id);

    // Prevent duplicate processing within this process
    if (this.processingJobs.has(jobId)) {
      return { success: false, reason: 'already_processing' };
    }

    this.processingJobs.add(jobId);

    try {
      if (job.attempts >= job.maxAttempts) {
        await JobQueue.findByIdAndUpdate(jobId, {
          status: JOB_STATUS.FAILED,
          processedAt: new Date(),
          error: 'Max attempts exceeded',
        });
        return { success: false, reason: 'max_attempts' };
      }

      // Atomic claim: only flip PENDING -> PROCESSING if it's still
      // PENDING at the moment of this write. Render can run multiple
      // instances of this service concurrently, and each one runs its
      // own copy of this worker — without this conditional filter,
      // two instances could both `find()` the same eligible job in
      // the same poll cycle and both process it (e.g. sending the
      // same push notification twice, or double-updating revenue).
      // If another instance already claimed it, `claimed` comes back
      // null and this instance backs off instead of double-processing.
      const claimed = await JobQueue.findOneAndUpdate(
        { _id: jobId, status: JOB_STATUS.PENDING },
        { status: JOB_STATUS.PROCESSING, $inc: { attempts: 1 } },
        { new: true },
      );

      if (!claimed) {
        return { success: false, reason: 'claimed_by_another_worker' };
      }

      console.log(`Processing job ${jobId} (attempt ${claimed.attempts})`);

      switch (job.type) {
        case JOB_TYPES.EMAIL_NOTIFICATION: {
          const { email, transactionType, amount, transactionId, timestamp, userName } = job.data as Record<string, string | number>;
          await sendTransactionNotification(
            String(email),
            String(transactionType),
            Number(amount),
            String(transactionId),
            String(timestamp),
            String(userName),
          );
          break;
        }

        case JOB_TYPES.TRANSACTION_HISTORY:
          await History.create(job.data);
          break;

        case JOB_TYPES.REVENUE_UPDATE: {
          const { type, amount: revenueAmount } = job.data as { type: RevenueType; amount: number };
          await updateRevenue(type, revenueAmount);
          break;
        }

        case JOB_TYPES.PUSH_NOTIFICATION: {
          const { pushToken, title, body } = job.data as { pushToken: string; title: string; body: string };
          await sendPushNotification(pushToken, title, body);
          break;
        }

        case JOB_TYPES.RESERVED_ACCOUNT_CREATION:
          await this.processReservedAccountCreation(job);
          break;

        default:
          throw new Error(`Unknown job type: ${job.type}`);
      }

      await JobQueue.findByIdAndUpdate(jobId, {
        status: JOB_STATUS.COMPLETED,
        processedAt: new Date(),
      });

      console.log(`Job ${jobId} completed successfully`);
      return { success: true };
    } catch (processingError) {
      const message = processingError instanceof Error ? processingError.message : String(processingError);
      console.error(`Job ${jobId} processing failed:`, message);

      const nextRetry = new Date();
      const backoffSeconds = Math.min(
        Math.pow(2, job.attempts) * 5,
        CONFIG.MAX_RETRY_DELAY,
      );
      nextRetry.setSeconds(nextRetry.getSeconds() + backoffSeconds);

      const updateData: Record<string, unknown> = {
        error: message,
        processedAt: new Date(),
      };

      if (job.attempts + 1 >= job.maxAttempts) {
        updateData.status = JOB_STATUS.FAILED;
        console.log(`Job ${jobId} marked as FAILED after ${job.attempts + 1} attempts`);
      } else {
        updateData.status = JOB_STATUS.PENDING;
        updateData.nextRetry = nextRetry;
        console.log(`Job ${jobId} scheduled for retry at ${nextRetry.toISOString()}`);
      }

      await JobQueue.findByIdAndUpdate(jobId, updateData);
      return { success: false, reason: 'processing_error' };
    } finally {
      this.processingJobs.delete(jobId);
    }
  }

  async processReservedAccountCreation(job: IJobQueue & { _id: unknown }): Promise<unknown> {
    const { accountData, userId } = job.data as { accountData: { email: string; [key: string]: unknown }; userId: string };

    console.log('Processing reserved account creation', {
      jobId: job._id,
      userId,
      email: accountData.email,
      attempt: job.attempts + 1,
    });

    const processedData = {
      ...accountData,
      preferred_bank: 'wema-bank',
      country: 'NG',
    };

    const response = await createReservedAccount(processedData);

    const updateUser = await User.findOneAndUpdate(
      { email: accountData.email },
      { isWalletCreated: true },
      { new: true },
    );

    if (!updateUser) {
      throw new Error(`User with email ${accountData.email} not found`);
    }

    console.log('Reserved account created successfully', {
      jobId: job._id,
      userId,
      email: accountData.email,
    });

    return response.data;
  }

  async processJobQueue(): Promise<{
    processed: boolean;
    count?: number;
    successful?: number;
    failed?: number;
    error?: string;
  }> {
    try {
      const eligibleJobs = await JobQueue.find({
        status: JOB_STATUS.PENDING,
        nextRetry: { $lte: new Date() },
      })
        .sort({ priority: 1, nextRetry: 1 })
        .limit(CONFIG.BATCH_SIZE)
        .lean();

      if (eligibleJobs.length === 0) {
        return { processed: false, count: 0 };
      }

      console.log(`Found ${eligibleJobs.length} jobs to process`);

      const results: JobResult[] = [];
      for (const job of eligibleJobs) {
        const result = await this.processSingleJob(job);
        results.push(result);
      }

      const successfulJobs = results.filter((r) => r.success).length;
      const failedJobs = results.filter((r) => !r.success).length;

      console.log(`Batch processing complete: ${successfulJobs} successful, ${failedJobs} failed`);

      return {
        processed: true,
        count: eligibleJobs.length,
        successful: successfulJobs,
        failed: failedJobs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Queue processing error:', message);
      return { processed: false, error: message };
    }
  }

  start(): void {
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
        console.error('Worker batch error:', error instanceof Error ? error.message : error);
      } finally {
        this.isProcessing = false;
      }
    }, CONFIG.PROCESSING_INTERVAL);

    console.log('Background job worker started successfully');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Background job worker stopped');
    }
  }

  setupGracefulShutdown(): void {
    const shutdown = async () => {
      console.log('Shutting down queue worker gracefully...');
      this.stop();

      let attempts = 0;
      while ((this.isProcessing || this.processingJobs.size > 0) && attempts < 30) {
        console.log(`Waiting for ${this.processingJobs.size} jobs to complete...`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        attempts++;
      }

      console.log('Queue worker shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }

  async getHealth() {
    try {
      const stats = await JobQueue.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            oldest: { $min: '$createdAt' },
            newest: { $max: '$createdAt' },
          },
        },
      ]);

      const failedJobs = await JobQueue.countDocuments({
        status: JOB_STATUS.FAILED,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      });

      return {
        healthy: failedJobs < 10,
        stats,
        totalFailedLast24h: failedJobs,
        isRunning: this.intervalId !== null,
        currentlyProcessing: this.processingJobs.size,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      };
    }
  }
}

export const queueWorker = new QueueWorker();
