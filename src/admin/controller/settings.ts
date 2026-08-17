import type { Request, Response } from "express";
import mongoose from "mongoose";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import Admin from "../models/admin.js";
import { getOrCreatePlatformSettings } from "../models/platformSettings.js";

// ══════════════════════════════════════════════════════
// GET /api/admin/settings/profile
// ══════════════════════════════════════════════════════
export const getProfile = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const admin = await Admin.findById(req.admin!.id).select(
      "name email role apiKeyLastFour createdAt"
    );
    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin not found" });
    }
    res.json({ success: true, data: admin });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch profile" });
  }
};

// ══════════════════════════════════════════════════════
// PATCH /api/admin/settings/profile
// Body: { name?, email? }
// ══════════════════════════════════════════════════════

export const updateProfile = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { name, email } = req.body;
    const updates: Record<string, unknown> = {};

    if (typeof name === "string") updates.name = name.trim();

    if (typeof email === "string" && email.trim()) {
      const normalized = email.trim().toLowerCase();
      const exists = await Admin.findOne({
        email: normalized,
        _id: { $ne: req.admin!.id },
      });
      if (exists) {
        return res
          .status(409)
          .json({ success: false, message: "Email already in use by another admin" });
      }
      updates.email = normalized;
    }

    const admin = await Admin.findByIdAndUpdate(req.admin!.id, updates, {
      new: true,
      runValidators: true,
      select: "name email role",
    });

    res.json({ success: true, message: "Profile updated", data: admin });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ success: false, message: "Failed to update profile" });
  }
};

// ══════════════════════════════════════════════════════
// POST /api/admin/settings/change-password
// Body: { currentPassword, newPassword }
// ══════════════════════════════════════════════════════

export const changePassword = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current and new password are required",
      });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters",
      });
    }

    const admin = await Admin.findById(req.admin!.id).select("+password");
    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin not found" });
    }
    const match = await admin.comparePassword(currentPassword);
    if (!match) {
      return res
        .status(401)
        .json({ success: false, message: "Current password is incorrect" });
    }

    admin.password = newPassword; // pre-save hook re-hashes
    await admin.save();

    res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ success: false, message: "Failed to change password" });
  }
};

// ══════════════════════════════════════════════════════
// GET /api/admin/settings/notifications
// PATCH /api/admin/settings/notifications
// Body: { txAlerts?, failedAlerts?, largeFunding?, newSignups?, weeklyDigest? }
// ══════════════════════════════════════════════════════

const NOTIF_KEYS = [
  "txAlerts",
  "failedAlerts",
  "largeFunding",
  "newSignups",
  "weeklyDigest",
];

export const getNotificationPrefs = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const admin = await Admin.findById(req.admin!.id).select("notificationPrefs");
    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin not found" });
    }
    res.json({ success: true, data: admin.notificationPrefs });
  } catch (error) {
    console.error("Get notification prefs error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch notification preferences" });
  }
};

export const updateNotificationPrefs = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const updates: Record<string, boolean> = {};
    for (const key of NOTIF_KEYS) {
      if (typeof req.body[key] === "boolean") {
        updates[`notificationPrefs.${key}`] = req.body[key];
      }
    }

    const admin = await Admin.findByIdAndUpdate(
      req.admin!.id,
      { $set: updates },
      { new: true, select: "notificationPrefs" }
    );

    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin not found" });
    }

    res.json({
      success: true,
      message: "Notification preferences updated",
      data: admin.notificationPrefs,
    });
  } catch (error) {
    console.error("Update notification prefs error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update notification preferences" });
  }
};

// ══════════════════════════════════════════════════════
// GET /api/admin/settings/platform
// PATCH /api/admin/settings/platform
// Body: { maintenanceMode: boolean }
// ══════════════════════════════════════════════════════

export const getPlatformSettings = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const settings = await getOrCreatePlatformSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error("Get platform settings error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch platform settings" });
  }
};

export const updatePlatformSettings = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const { maintenanceMode } = req.body;
    if (typeof maintenanceMode !== "boolean") {
      return res
        .status(400)
        .json({ success: false, message: "'maintenanceMode' must be a boolean" });
    }

    const settings = await getOrCreatePlatformSettings();
    settings.maintenanceMode = maintenanceMode;
    settings.updatedBy = new mongoose.Types.ObjectId(req.admin!.id);
    await settings.save();

    res.json({
      success: true,
      message: maintenanceMode
        ? "Maintenance mode enabled — customer purchases are now paused"
        : "Maintenance mode disabled",
      data: settings,
    });
  } catch (error) {
    console.error("Update platform settings error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update platform settings" });
  }
};

// ══════════════════════════════════════════════════════
// GET /api/admin/settings/api-key
// Returns only the masked last 4 chars — the full key is never
// stored in plaintext, so it cannot be "revealed" after creation.
// ══════════════════════════════════════════════════════

export const getApiKey = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const admin = await Admin.findById(req.admin!.id).select("apiKeyLastFour");
    if (!admin) {
      return res.status(404).json({ success: false, message: "Admin not found" });
    }
    res.json({
      success: true,
      data: {
        hasKey: !!admin.apiKeyLastFour,
        lastFour: admin.apiKeyLastFour,
      },
    });
  } catch (error) {
    console.error("Get API key error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch API key" });
  }
};

// ══════════════════════════════════════════════════════
// POST /api/admin/settings/api-key/regenerate
// Returns the plaintext key ONE TIME ONLY. Only its bcrypt hash
// and last 4 characters are persisted.
// ══════════════════════════════════════════════════════
export const regenerateApiKey = async (req: Request, res: Response): Promise<Response | void> => {
  try {
    const plainKey = `dp_live_${crypto.randomBytes(24).toString("hex")}`;
    const hash = await bcrypt.hash(plainKey, 12);
    const lastFour = plainKey.slice(-4);

    await Admin.findByIdAndUpdate(req.admin!.id, {
      apiKeyHash: hash,
      apiKeyLastFour: lastFour,
    });

    res.json({
      success: true,
      message: "New API key generated — copy it now, it won't be shown again",
      data: { apiKey: plainKey, lastFour },
    });
  } catch (error) {
    console.error("Regenerate API key error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to regenerate API key" });
  }
};