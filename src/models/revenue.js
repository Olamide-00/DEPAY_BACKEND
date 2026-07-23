import mongoose from "mongoose";

const revenueSchema = new mongoose.Schema(
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
  { timestamps: true }
);

const Revenue = mongoose.model("Revenue", revenueSchema);

export default Revenue;
