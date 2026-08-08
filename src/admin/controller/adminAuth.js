import jwt from "jsonwebtoken";
import crypto from "crypto";
import Admin from "../models/admin.js";
import { sendMail } from "../../service/version2/emailService/emailService.js";

const ALLOWED_EMAILS = ["officialolamide001@gmail.com", "admin@jaan.ng"];
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; 

// ══════════════════════════════════════════════════════
// POST /api/admin/signup
// Body: { email, password }
// ══════════════════════════════════════════════════════

export const adminSignup = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required",
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 8 characters",
    });
  }

  // ── Whitelist check ───────────────────────────────
  if (!ALLOWED_EMAILS.includes(email.toLowerCase())) {
    return res.status(403).json({
      success: false,
      message: "You are not authorized to create an admin account",
    });
  }

  try {
    // ── Check if this email already registered ────────
    const exists = await Admin.findOne({ email: email.toLowerCase() });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }

    const admin = await Admin.create({ email: email.toLowerCase(), password });

    const token = jwt.sign(
      { id: admin._id, email: admin.email, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.status(201).json({
      success: true,
      message: "Admin account created",
      token,
      admin: { id: admin._id, email: admin.email },
    });
  } catch (error) {
    console.error("Admin signup error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error during signup" });
  }
};

// ══════════════════════════════════════════════════════
// POST /api/admin/login
// Body: { email, password }
// ══════════════════════════════════════════════════════

export const adminLogin = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required",
    });
  }

  try {
    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const match = await admin.comparePassword(password);
    if (!match) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const token = jwt.sign(
      { id: admin._id, email: admin.email, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      admin: { id: admin._id, email: admin.email },
    });
  } catch (error) {
    console.error("Admin login error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error during login" });
  }
};

// ══════════════════════════════════════════════════════
// POST /api/admin/auth/forgot-password
// Body: { email }
//
// Always returns 200 with a generic message regardless of whether
// the email matches an admin account — this deliberately avoids
// leaking which emails have admin accounts (email enumeration).
// ══════════════════════════════════════════════════════

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: "Email is required" });
    }

    const genericResponse = {
      success: true,
      message:
        "If an admin account exists for that email, a password reset link is on its way.",
    };

    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });
    if (!admin) {
      // Same response either way — see note above.
      return res.json(genericResponse);
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    admin.resetPasswordTokenHash = tokenHash;
    admin.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await admin.save();

    const resetUrl = `${process.env.ADMIN_DASHBOARD_URL || ""}/reset-password?token=${rawToken}&email=${encodeURIComponent(admin.email)}`;

    try {
      await sendMail({
        to: admin.email,
        subject: "Reset your DePay admin password",
        html: `
          <p>A password reset was requested for your DePay admin account.</p>
          <p><a href="${resetUrl}">Click here to reset your password</a></p>
          <p>This link expires in 30 minutes. If you didn't request this, you can ignore this email.</p>
        `,
      });
    } catch (mailErr) {
      // Don't fail the request over email delivery — token is already
      // saved, admin can retry "forgot password" if the email doesn't land.
      console.error("Reset email delivery failed:", mailErr.message);
    }

    res.json(genericResponse);
  } catch (error) {
    console.error("Forgot password error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error processing request" });
  }
};

// ══════════════════════════════════════════════════════
// POST /api/admin/auth/reset-password
// Body: { email, token, newPassword }
// ══════════════════════════════════════════════════════

export const resetPassword = async (req, res) => {
  try {
    const { email, token, newPassword } = req.body;

    if (!email || !token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email, token and new password are required",
      });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const admin = await Admin.findOne({
      email: email.toLowerCase().trim(),
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    }).select("+resetPasswordTokenHash +resetPasswordExpires");

    if (!admin) {
      return res.status(400).json({
        success: false,
        message: "This reset link is invalid or has expired",
      });
    }

    admin.password = newPassword; // pre-save hook re-hashes
    admin.resetPasswordTokenHash = null;
    admin.resetPasswordExpires = null;
    await admin.save();

    res.json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error resetting password" });
  }
};