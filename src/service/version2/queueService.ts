import JobQueue, { type JobQueueDocument } from '../../models/version2/queue.js';
import { JOB_TYPES, type JobType } from '../../utils/version2/constants.js';

type JobData = Record<string, unknown>;
type Validator = (data: JobData) => void;

export class QueueService {
  validateJobData(type: JobType, data: JobData): void {
    const validators: Partial<Record<JobType, Validator>> = {
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
      },
      [JOB_TYPES.PUSH_NOTIFICATION]: (data) => {
        if (!data.pushToken || !data.title) {
          throw new Error('Invalid push notification job data');
        }
      },
    };

    const validator = validators[type];
    if (validator) {
      validator(data);
    }
  }

  async queueJob(type: JobType, data: JobData, priority = 1): Promise<JobQueueDocument> {
    try {
      this.validateJobData(type, data);

      const job = await JobQueue.create({
        type,
        data,
        priority,
        nextRetry: new Date(),
      });

      console.log(`Job queued successfully: ${type}`, { jobId: job._id });
      return job;
    } catch (error) {
      console.error('Failed to queue job:', error instanceof Error ? error.message : error);
      throw error;
    }
  }

  /**
   * Queue a push notification for retried, non-blocking delivery
   * instead of a single fire-and-forget attempt. Used anywhere a
   * push notification is a "nice to have" side effect of a request
   * (bill payment success, wallet funding) that shouldn't fail or
   * slow down the request itself if Expo's push API is briefly down.
   */
  async queuePushNotification(
    pushToken: string | undefined | null,
    title: string,
    body: string,
  ): Promise<JobQueueDocument | null> {
    if (!pushToken) return null;
    return this.queueJob(JOB_TYPES.PUSH_NOTIFICATION, { pushToken, title, body }, 2);
  }
}

export const queueService = new QueueService();
