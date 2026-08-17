import axios from "axios";

export const sendPushNotification = async (
  pushToken: string,
  title: string,
  body: string,
): Promise<void> => {
  try {
    // Expo push API endpoint
    const response = await axios.post("https://exp.host/--/api/v2/push/send", {
      to: pushToken,
      sound: "default",
      title,
      body,
      data: { title, body },
      priority: "high",
      badge: 1,
      channelId: "default",
    });

    console.log("✅ Notification sent:", response.data);
  } catch (error) {
    const axiosError = error as { response?: { data: unknown }; message: string };
    console.error("❌ Error sending notification:", axiosError.response?.data || axiosError.message);
  }
};
