import mongoose from 'mongoose';
import { JOB_TYPES, JOB_STATUS } from '../../utils/version2/constants.js';

const jobQueueSchema = new mongoose.Schema({
  type: { 
    type: String, 
    required: true, 
    enum: Object.values(JOB_TYPES),
    index: true 
  },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  status: { 
    type: String, 
    enum: Object.values(JOB_STATUS),
    default: JOB_STATUS.PENDING,
    index: true
  },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 3 },
  priority: { type: Number, default: 1 },
  error: String,
  nextRetry: { type: Date, default: Date.now, index: true },
  processedAt: Date,
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

jobQueueSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });
jobQueueSchema.index({ status: 1, nextRetry: 1, priority: 1 });

export default mongoose.model('JobQueue', jobQueueSchema);