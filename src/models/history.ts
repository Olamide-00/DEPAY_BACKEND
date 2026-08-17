import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";

export type HistoryType = "PENDING" | "DEBIT" | "CREDIT" | "FAILED";
export type HistoryStatus = "PENDING" | "SUCCESS" | "FAILED" | "REVERSED";

export interface IHistory {
  userId: mongoose.Types.ObjectId;
  service?: string;
  amount: number;
  transactionReference: string;
  receipentBank?: string;
  receipentName?: string;
  destinationBankName?: string;
  account_number?: string;
  transactionNumber?: string;
  name?: string;
  type?: HistoryType;
  senderBank?: string;
  status: HistoryStatus;
  fee: number;
  reversedAt: Date | null;
  reversedBy: mongoose.Types.ObjectId | null;
  token: string | null;
  units: string | null;
  serialNumber?: string;
  pin?: string;
  jambPin?: string;
  serviceID?: string;
  variation_code?: string;
  billersCode?: string;
  createdAt: Date;
  additionalData?: unknown;
}

export type HistoryDocument = HydratedDocument<IHistory>;

const historySchema = new Schema<IHistory>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  service: { type: String },
  amount: { type: Number, required: true },
  transactionReference: { type: String, required: true, unique: true },
  receipentBank: { type: String },
  receipentName: { type: String },
  destinationBankName: { type: String },
  account_number: { type: String },
  transactionNumber: { type: String },
  name: { type: String },
  type: { type: String, enum: ["PENDING", "DEBIT", "CREDIT", "FAILED"] },
  senderBank: { type: String },
  status: {
    type: String,
    required: true,
    enum: ["PENDING", "SUCCESS", "FAILED", "REVERSED"],
    default: "PENDING",
  },
  fee: { type: Number, default: 0, min: 0 },
  reversedAt: { type: Date, default: null },
  reversedBy: { type: Schema.Types.ObjectId, ref: "Admin", default: null },
  token: { type: String, default: null },
  units: { type: String, default: null },
  serialNumber: { type: String },
  pin: { type: String },
  jambPin: { type: String },
  serviceID: { type: String },
  variation_code: { type: String },
  billersCode: { type: String },
  createdAt: { type: Date, default: Date.now },
  additionalData: { type: Schema.Types.Mixed },
});

// ── Indexes ──────────────────────────────────────────────────
// `transactionReference` is already indexed via its `unique: true`
// above. These cover the two query patterns actually used against
// this collection (checked against every current query in the
// codebase, not guessed):
//   - getBillsHistories / a user's own transaction list:
//     find({ userId }).sort({ createdAt: -1 })
//   - admin transaction list: find({ status, createdAt: {$gte} })
//     .sort({ createdAt: -1 }), sometimes filtered by status alone
// Without these, both scan the entire collection — fine at a few
// hundred documents, a real problem once history has grown past
// tens of thousands of rows across 1000+ active users.
historySchema.index({ userId: 1, createdAt: -1 });
historySchema.index({ status: 1, createdAt: -1 });

const History: Model<IHistory> = mongoose.model<IHistory>("History", historySchema);

export default History;
