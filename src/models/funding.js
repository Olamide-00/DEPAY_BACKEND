import mongoose from "mongoose";

const fundingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
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
  }
);

const Funding = mongoose.model("Funding", fundingSchema);

export default Funding;