import type { Request, Response } from "express";
import { verifySmartcard } from "../../service/bills/verification.js";

export const verifySmartcardController = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Expect the request body to include: serviceID and billerCode
    const payload = req.body;
    const data = await verifySmartcard(payload);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in verifySmartcardController:", error instanceof Error ? error.message : error);
    return res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
