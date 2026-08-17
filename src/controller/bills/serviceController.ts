import type { Request, Response } from "express";
import History from "../../models/history.js";
import User from "../../models/users.js";
import {
  getPackage,
  getServices,
  payBill,
} from "../../service/bills/services.js";
import type { PayBillPayload } from "../../types/vtpass.js";

// NOTE: this v1 controller is not mounted on any route (see
// routes/bills.js, which uses controller/version2/bills/serviceController.ts
// instead) — confirmed by grep across src/routes before converting. Kept
// and converted for completeness rather than deleted, since it wasn't
// asked to be removed.

export const getServicesController = async (req: Request, res: Response): Promise<Response> => {
  const { identifier } = req.query;
  try {
    const data = await getServices(String(identifier));
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error in getServicesController:", message);
    return res.status(500).json({
      success: false,
      message,
    });
  }
};

export const payBillController = async (req: Request, res: Response): Promise<Response> => {
  try {
    const payload = req.body as PayBillPayload;

    const data = await payBill(payload);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error in payBillController:", message);
    return res.status(500).json({
      success: false,
      message,
    });
  }
};

export const getServiceVariationsController = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Get serviceID from query parameters or default to 'mtn-data'
    const serviceID = String(req.query.serviceID || "mtn-data");
    const data = await getPackage(serviceID);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error in getServiceVariationsController:", message);
    return res.status(500).json({
      success: false,
      message,
    });
  }
};

// get bills histories
export const getBillsHistories = async (req: Request, res: Response): Promise<Response> => {
  const { email } = req.params;
  if (!email) return res.status(400).json({ message: "Email is required" });

  try {
    // Find the user
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Fetch bill history using userId
    const histories = await History.find({ userId: user._id }).sort({
      createdAt: -1,
    });

    // Extract only required fields
    const filteredHistories = histories.map((history) => {
      const additionalData = history.additionalData as Record<string, any> | undefined;
      return {
        service: history.service,
        amount: history.amount,
        transactionReference: history.transactionReference,
        status: history.status,
        receipentName: history.receipentName,
        receipentBank: history.receipentBank,
        type: history.type,
        name: history.name,
        destinationBankName: history.destinationBankName,
        account_number: history.account_number,
        senderBank: history.senderBank,
        phone: additionalData?.content?.transactions?.phone || null,
        date: history.createdAt,
        unique_element: additionalData?.content?.transactions?.unique_element || null,
        transaction_id: additionalData?.content?.transactions?.transactionId || null,
        transaction_date: additionalData?.transaction_date || null,
        token: history.token || null,
        units: history.units || null,
        jambPin: history.jambPin || null,
        serialNumber: history.serialNumber || null,
        pin: history.pin || null,
      };
    });

    return res.status(200).json(filteredHistories);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error fetching bill history:", message);
    return res.status(500).json({ message: "Internal server error" });
  }
};
