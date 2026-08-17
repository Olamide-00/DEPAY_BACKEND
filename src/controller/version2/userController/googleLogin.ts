import type { Request, Response } from "express";
import User from "../../../models/users.js";
import jwt from "jsonwebtoken";
import { sendLoginNotification } from "../../../service/emailService/loginNot.js";

export const googleLogin = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { email, name, googleId, profilePicture } = req.body;

    // Validate
    if (!email || !googleId) {
      return res.status(400).json({
        message: "Invalid request — email and googleId are required.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists in MongoDB — LOGIN ONLY, no auto-creation
    const user = await User.findOne({ email: normalizedEmail });

    // No account → redirect to signup
    if (!user) {
      return res.status(404).json({
        message:
          "No Depay account found with this Google email. Please sign up first.",
        email: normalizedEmail,
      });
    }

    // Account not verified
    if (!user.isEmailVerified) {
      return res.status(403).json({
        message: "Please verify your email before logging in.",
        email: normalizedEmail,
      });
    }

    // Issue your JWT — same as normal login
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET as string, {
      expiresIn: "30d",
    });

    // Send login notification (non-blocking)
    const forwardedFor = req.headers["x-forwarded-for"];
    const forwarded = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    const ipAddress = forwarded?.split(",")[0]?.trim() || req.socket?.remoteAddress || "Unknown";

    sendLoginNotification(normalizedEmail, ipAddress, "Google OAuth").catch((err) =>
      console.error("Login notification error:", err),
    );

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        email: user.email,
        name: name,
        phoneNumber: user.phoneNumber,
        isWalletCreated: user.isWalletCreated,
        balance: user.balance,
        profilePicture: user.profilePicture || profilePicture || null,
        tag: user.tag,
        dateOfBirth: user.dateOfBirth,
        gender: user.gender,
        bankName: user.bankName,
        accountNumber: user.accountNumber,
        jTokens: user.jTokens,
        accountDetails: user.accountDetails || [],
        reservedAccountReference: user.reservedAccountReference || null,
        reservedAccountName: user.reservedAccountName || null,
      },
    });
  } catch (error) {
    console.error("Google login error:", error);
    return res.status(500).json({
      message: "Something went wrong. Please try again.",
    });
  }
};
