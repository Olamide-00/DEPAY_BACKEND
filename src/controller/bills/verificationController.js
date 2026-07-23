import { verifySmartcard } from "../../service/bills/verification.js";

export const verifySmartcardController = async (req, res) => {
  try {
    // Expect the request body to include: serviceID and billerCode
    const payload = req.body;
    const data = await verifySmartcard(payload);
    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in verifySmartcardController:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
