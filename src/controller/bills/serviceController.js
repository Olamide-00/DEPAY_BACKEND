import History from "../../models/history.js";
import User from "../../models/users.js";
import {
  getPackage,
  getServices,
  payBill,
} from "../../service/bills/services.js";

export const getServicesController = async (req, res) => {
  const { identifier } = req.query;
  try {
    const data = await getServices(identifier);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in getServicesController:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const payBillController = async (req, res) => {
  try {
    const payload = req.body;

    const data = await payBill(payload);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in payBillController:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getServiceVariationsController = async (req, res) => {
  try {
    // Get serviceID from query parameters or default to 'mtn-data'
    const serviceID = req.query.serviceID || "mtn-data";
    const data = await getPackage(serviceID);

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in getServiceVariationsController:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// get bills histories
export const getBillsHistories = async (req, res) => {
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
    const filteredHistories = histories.map((history) => ({
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
      phone: history.additionalData?.content?.transactions?.phone || null,
      date: history.createdAt,
      unique_element:
        history.additionalData?.content?.transactions?.unique_element || null,
      transaction_id:
        history.additionalData?.content?.transactions?.transactionId || null,
      transaction_date: history.additionalData?.transaction_date || null,
      token: history.token || null,
      units: history.units || null,
      jambPin: history.jambPin || null,
      serialNumber: history.serialNumber || null,
      pin: history.pin || null,
    }));

    return res.status(200).json(filteredHistories);
  } catch (error) {
    console.error("Error fetching bill history:", error.message);
    return res.status(500).json({ message: "Internal server error" });
  }
};
