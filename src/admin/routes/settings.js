import express from "express";
import {
  getProfile,
  updateProfile,
  changePassword,
  getNotificationPrefs,
  updateNotificationPrefs,
  getPlatformSettings,
  updatePlatformSettings,
  getApiKey,
  regenerateApiKey,
} from "../controller/settings.js";

const router = express.Router();

router.get("/profile", getProfile);
router.patch("/profile", updateProfile);
router.post("/change-password", changePassword);
router.get("/notifications", getNotificationPrefs);
router.patch("/notifications", updateNotificationPrefs);
router.get("/platform", getPlatformSettings);
router.patch("/platform", updatePlatformSettings);
router.get("/api-key", getApiKey);
router.post("/api-key/regenerate", regenerateApiKey);

export default router;