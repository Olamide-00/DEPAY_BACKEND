import mongoose from "mongoose";

const historySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
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
  reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  token: { type: String, default: null },
  units: { type: String, default: null },
  serialNumber: { type: String },
  pin: { type: String },
  jambPin: { type: String },
  serviceID: { type: String },
  variation_code: { type: String },
  billersCode: { type: String },
  createdAt: { type: Date, default: Date.now },
  additionalData: { type: mongoose.Schema.Types.Mixed },
});

const History = mongoose.model("History", historySchema);

export default History;