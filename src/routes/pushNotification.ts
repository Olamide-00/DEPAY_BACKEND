import express from "express";
import { sendNotificationToUser } from "../controller/pushNotifications/singleNotification.js";
import { sendPushNotificationToAllUser } from "../controller/pushNotifications/allUser.js";

const router = express.Router();

router.post("/push-Notification", sendNotificationToUser);
router.post("/user-Notification", sendPushNotificationToAllUser);

export default router;
