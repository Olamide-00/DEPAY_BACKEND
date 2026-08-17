import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";
import { JOB_TYPES, JOB_STATUS, type JobType, type JobStatus } from "../../utils/version2/constants.js";

export interface IJobQueue {
  type: JobType;
  data: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  priority: number;
  error?: string;
  nextRetry: Date;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type JobQueueDocument = HydratedDocument<IJobQueue>;

const jobQueueSchema = new Schema<IJobQueue>(
  {
    type: {
      type: String,
      required: true,
      enum: Object.values(JOB_TYPES),
      index: true,
    },
    data: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: Object.values(JOB_STATUS),
      default: JOB_STATUS.PENDING,
      index: true,
    },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    priority: { type: Number, default: 1 },
    error: String,
    nextRetry: { type: Date, default: Date.now, index: true },
    processedAt: Date,
    createdAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  },
);

jobQueueSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });
jobQueueSchema.index({ status: 1, nextRetry: 1, priority: 1 });

const JobQueue: Model<IJobQueue> = mongoose.model<IJobQueue>("JobQueue", jobQueueSchema);

export default JobQueue;
