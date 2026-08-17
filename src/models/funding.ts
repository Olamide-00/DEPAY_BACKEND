import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";

export interface IFunding {
  userId: mongoose.Types.ObjectId;
  amount: number;
  date: Date;
  card_type: string;
  sender_name: string;
  fee: number;
  reference?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type FundingDocument = HydratedDocument<IFunding>;

const fundingSchema = new Schema<IFunding>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    card_type: {
      type: String,
      required: true,
    },
    sender_name: {
      type: String,
      required: true,
    },
    fee: { type: Number, default: 0, min: 0 },
    reference: { type: String, unique: true, sparse: true },
  },
  {
    timestamps: true,
  },
);

const Funding: Model<IFunding> = mongoose.model<IFunding>("Funding", fundingSchema);

export default Funding;
