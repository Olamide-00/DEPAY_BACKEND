import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";

export type RevenueType = "BILL" | "TRANSFER";

export interface IRevenue {
  type: RevenueType;
  amount: number;
  createdAt: Date;
  updatedAt: Date;
}

export type RevenueDocument = HydratedDocument<IRevenue>;

const revenueSchema = new Schema<IRevenue>(
  {
    type: {
      type: String,
      enum: ["BILL", "TRANSFER"],
      required: true,
      unique: true,
    },
    amount: {
      type: Number,
      required: true,
      default: 0,
    },
  },
  { timestamps: true },
);

const Revenue: Model<IRevenue> = mongoose.model<IRevenue>("Revenue", revenueSchema);

export default Revenue;
