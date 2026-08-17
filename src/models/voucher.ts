import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";

export type VoucherStatus = "active" | "redeemed" | "expired";

export interface IVoucher {
  code: string;
  amount: number;
  createdBy: mongoose.Types.ObjectId;
  redeemedBy: mongoose.Types.ObjectId | null;
  status: VoucherStatus;
  expiresAt: Date;
  redeemedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type VoucherDocument = HydratedDocument<IVoucher>;

const voucherSchema = new Schema<IVoucher>(
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
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    redeemedBy: {
      type: Schema.Types.ObjectId,
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

const Voucher: Model<IVoucher> = mongoose.model<IVoucher>("Voucher", voucherSchema);
export default Voucher;
