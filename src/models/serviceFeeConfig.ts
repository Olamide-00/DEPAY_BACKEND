import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";

export type FeeType = "flat" | "percentage";

export interface IServiceFeeConfig {
  serviceID: string;
  feeType: FeeType;
  feeValue: number; // flat: naira amount. percentage: e.g. 2 means 2%
  minFee?: number | null; // only meaningful for feeType: "percentage"
  maxFee?: number | null; // only meaningful for feeType: "percentage"
  isEnabled: boolean;
  updatedByAdminId: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ServiceFeeConfigDocument = HydratedDocument<IServiceFeeConfig>;

const serviceFeeConfigSchema = new Schema<IServiceFeeConfig>(
  {
    serviceID: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    feeType: {
      type: String,
      enum: ["flat", "percentage"],
      required: true,
      default: "flat",
    },
    feeValue: {
      type: Number,
      required: true,
      min: 0,
    },
    minFee: {
      type: Number,
      default: null,
      min: 0,
    },
    maxFee: {
      type: Number,
      default: null,
      min: 0,
    },
    isEnabled: {
      type: Boolean,
      default: true,
      index: true,
    },
    updatedByAdminId: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
  },
  { timestamps: true },
);

const ServiceFeeConfig: Model<IServiceFeeConfig> =
  mongoose.model<IServiceFeeConfig>("ServiceFeeConfig", serviceFeeConfigSchema);

export default ServiceFeeConfig;
