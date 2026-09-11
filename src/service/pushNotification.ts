import { Expo } from "expo-server-sdk";
import User from "../models/users.js";

const expo = new Expo();

// Function to send a push notification to a single user
const sendPushNotificationToUser = async (email: string, message: string) => {
  try {
    // Find the user by email to get their push token
    const user = await User.findOne({ email: email });

    if (!user) {
      throw new Error("User not found");
    }

    const pushToken = user.pushToken;

    if (!pushToken || !Expo.isExpoPushToken(pushToken)) {
      throw new Error("Invalid Expo push token");
    }

    // Prepare the notification message
    const messages: import("expo-server-sdk").ExpoPushMessage[] = [
      {
        to: pushToken,
        sound: "default",
        title: "New Notification",
        body: message,
        data: { message },
      },
    ];

    const tickets = await expo.sendPushNotificationsAsync(messages);

    // Log the ticket response to see the status
    console.log("Tickets:", tickets);

    return tickets;
  } catch (error) {
    console.error("Error sending notification:", error);
    throw error;
  }
};

// Function to send a push notification to all users
const sendPushNotificationToAllUsers = async (message: string) => {
  try {
    // Fetch all users
    const users = await User.find();

    if (!users || users.length === 0) {
      throw new Error("No users found");
    }

    // Filter out users without a valid push token
    const validUsers = users.filter(
      (user): user is typeof user & { pushToken: string } =>
        !!user.pushToken && Expo.isExpoPushToken(user.pushToken),
    );

    if (validUsers.length === 0) {
      throw new Error("No valid users with push tokens found");
    }

    // Prepare the messages array for all valid users
    const messages: import("expo-server-sdk").ExpoPushMessage[] =
      validUsers.map((user) => ({
        to: user.pushToken,
        sound: "default",
        title: "New Notification",
        body: message,
        data: { message },
      }));

    // Send notifications to all users
    const tickets = await expo.sendPushNotificationsAsync(messages);

    // Log the ticket response to see the status
    console.log("Tickets:", tickets);

    return tickets;
  } catch (error) {
    console.error("Error sending notification to all users:", error);
    throw error;
  }
};

export { sendPushNotificationToUser, sendPushNotificationToAllUsers };
