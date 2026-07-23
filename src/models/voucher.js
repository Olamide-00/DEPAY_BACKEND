import mongoose from "mongoose";

const voucherSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true, // This is great! It handles the normalization for you
      trim: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 100,
      max: 50000,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    redeemedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "redeemed", "expired"],
      default: "active",
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      // REMOVED index: true from here
    },
    redeemedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

voucherSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Voucher = mongoose.model("Voucher", voucherSchema);
export default Voucher;
