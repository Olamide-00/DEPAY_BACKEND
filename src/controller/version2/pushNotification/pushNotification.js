import axios from "axios";

export const sendPushNotification = async (pushToken, title, body) => {
  try {
    // Expo push API endpoint
    const response = await axios.post("https://exp.host/--/api/v2/push/send", {
      to: pushToken,
      sound: "default",
      title,
      body,
      data: { title, body },
      priority: 'high', 
      badge: 1, 
      channelId: 'default',
    });

    console.log("✅ Notification sent:", response.data);
  } catch (error) {
    console.error("❌ Error sending notification:", error.response?.data || error.message);
  }
};
