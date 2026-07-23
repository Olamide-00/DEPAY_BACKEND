import { sendPushNotificationToUser } from "../../service/pushNotification.js";

export const sendNotificationToUser = async (req, res) => {
  const { email, message } = req.body;

  // Check if email and message are provided
  if (!email || !message) {
    return res
      .status(400)
      .send("Both email and message are required to send a notification");
  }

  try {
    const tickets = await sendPushNotificationToUser(email, message);

    // Return success message and ticket info
    return res.status(200).json({
      message: "Notification sent successfully",
      tickets,
    });
  } catch (error) {
    // Log the error for better debugging
    console.error("Error sending notification:", error);

    return res.status(500).json({
      message: "Error sending notification",
      error: error.message,
    });
  }
};
