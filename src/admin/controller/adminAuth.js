import jwt from "jsonwebtoken";
import Admin from "../models/admin.js";

const ALLOWED_EMAILS = ["officialolamide001@gmail.com", "admin@jaan.ng"];

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
