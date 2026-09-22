import type { Request, Response } from "express";
import ServiceFeeConfig from "../../../models/serviceFeeConfig.js";
import { getFeeQuote } from "../../../service/bills/feeService.js";

export const listChargesController = async (
  _req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const configs = await ServiceFeeConfig.find({ isEnabled: true })
      .select("category feeType feeValue minFee maxFee")
      .sort({ category: 1 })
      .lean();

    return res.status(200).json({ success: true, data: configs });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error in listChargesController:", message);
    return res.status(500).json({ success: false, message });
  }
};

export const getFeeQuoteController = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const serviceID =
      typeof req.query.serviceID === "string" ? req.query.serviceID.trim() : "";
    const amount = Number(req.query.amount);

    if (!serviceID) {
      return res
        .status(400)
        .json({ success: false, message: "serviceID is required" });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "amount must be a positive number",
      });
    }

    const quote = await getFeeQuote(serviceID, amount);
    return res.status(200).json({ success: true, data: quote });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error in getFeeQuoteController:", message);
    return res.status(500).json({ success: false, message });
  }
};
