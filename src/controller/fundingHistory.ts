import type { Request, Response } from "express";
import Funding from "../models/funding.js";
import User from "../models/users.js";

export const getUserFundingHistory = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  const { email } = req.params;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    const fundingHistory = await Funding.find({ userId: user._id }).sort({
      createdAt: -1,
    });

    const normalized = fundingHistory.map((funding) => {
      const isAdminCredit = funding.card_type === "Admin";
      return {
        _id: funding._id,
        service: isAdminCredit ? "admin-funding" : "wallet-funding",
        category: "wallet",
        label: isAdminCredit ? "Refund" : "Wallet Funding",
        amount: funding.amount,
        transactionReference: funding.reference,
        status: "success",
        type: "credit",
        senderName: funding.sender_name,
        cardType: funding.card_type,
        date: funding.createdAt,
      };
    });

    return res.status(200).json({
      message: "Funding history fetched successfully.",
      data: normalized,
    });
  } catch (error) {
    console.error("Error fetching funding history:", error);
    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};
