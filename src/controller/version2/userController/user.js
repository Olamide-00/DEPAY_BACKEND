import User from "../../../models/users.js";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { sendOTPEmail } from "../../../service/emailService/OTP.js";
import { sendLoginNotification } from "../../../service/emailService/loginNot.js";
import { sendWelcomeEmail } from "../../../service/emailService/welcome.js";
import { sendPushNotification } from "../pushNotification/pushNotification.js";

import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../../../utils/version2/refreshToken.js";

dotenv.config();

const MAX_OTP_ATTEMPTS = 5;
const OTP_ATTEMPT_WINDOW = 15 * 60 * 1000;
const OTP_EXPIRY = 5 * 60000;
const ACCOUNT_LOCK_DURATION = 30 * 60 * 1000;

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_ATTEMPT_WINDOW = 15 * 60 * 1000;

const PIN_REGEX = /^\d{4,6}$/;

// ─── Validation helpers ───────────────────────────────────────
const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validatePassword = (password) => password && password.length >= 8;
const validatePIN = (pin) => typeof pin === "string" && PIN_REGEX.test(pin);
const normalizeEmail = (email) => {
  if (!email || typeof email !== "string") return null;
  return email.trim().toLowerCase();
};

const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();
const hashOTP = async (otp) => await bcrypt.hash(otp, 10);

const isAccountLocked = (user) => {
  if (!user.accountLockedUntil) return false;
  return new Date() < new Date(user.accountLockedUntil);
};

// ─── OTP attempt tracking — uses updateOne (works with lean docs) ───
const checkOTPAttempts = async (user) => {
  const now = new Date();
  const windowStart = user.otpAttemptWindowStart
    ? new Date(user.otpAttemptWindowStart)
    : null;

  let attempts = user.otpAttempts || 0;

  // Reset if window has passed
  if (!windowStart || now - windowStart > OTP_ATTEMPT_WINDOW) {
    attempts = 0;
  }

  attempts += 1;

  if (attempts >= MAX_OTP_ATTEMPTS) {
    const lockedUntil = new Date(now.getTime() + ACCOUNT_LOCK_DURATION);
    await User.updateOne(
      { email: user.email },
      {
        $set: {
          otpAttempts: attempts,
          otpAttemptWindowStart: now,
          accountLockedUntil: lockedUntil,
        },
      }
    );
    return {
      locked: true,
      remainingAttempts: 0,
      message: `Account locked due to too many failed attempts. Try again after 30 minutes.`,
    };
  }

  await User.updateOne(
    { email: user.email },
    {
      $set: {
        otpAttempts: attempts,
        otpAttemptWindowStart: now,
      },
    }
  );

  return {
    locked: false,
    remainingAttempts: MAX_OTP_ATTEMPTS - attempts,
  };
};

// ─── Login attempt tracking — mirrors OTP attempt logic ───
// NOTE: requires `loginAttempts` and `loginAttemptWindowStart` fields on the
// User schema (Number and Date respectively). Add them to models/users.js
// if they don't already exist, or this will silently no-op on save.
const checkLoginAttempts = async (user) => {
  const now = new Date();
  const windowStart = user.loginAttemptWindowStart
    ? new Date(user.loginAttemptWindowStart)
    : null;

  let attempts = user.loginAttempts || 0;

  if (!windowStart || now - windowStart > LOGIN_ATTEMPT_WINDOW) {
    attempts = 0;
  }

  attempts += 1;

  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    const lockedUntil = new Date(now.getTime() + ACCOUNT_LOCK_DURATION);
    await User.updateOne(
      { email: user.email },
      {
        $set: {
          loginAttempts: attempts,
          loginAttemptWindowStart: now,
          accountLockedUntil: lockedUntil,
        },
      }
    );
    return {
      locked: true,
      message:
        "Account locked due to too many failed login attempts. Try again after 30 minutes.",
    };
  }

  await User.updateOne(
    { email: user.email },
    {
      $set: {
        loginAttempts: attempts,
        loginAttemptWindowStart: now,
      },
    }
  );

  return { locked: false, remainingAttempts: MAX_LOGIN_ATTEMPTS - attempts };
};

const resetLoginAttempts = async (email) => {
  await User.updateOne(
    { email },
    {
      $set: {
        loginAttempts: 0,
        loginAttemptWindowStart: null,
      },
    }
  );
};

// ─── findUserWithOTP — .lean() bypasses toJSON transform so otp field is visible ───
const findUserWithOTP = async (email) => {
  return await User.findOne({ email })
    .select(
      "+otp +otpExpires +otpAttempts +otpAttemptWindowStart +accountLockedUntil"
    )
    .lean();
};

// For verifyResetOTP — needs password too, not lean so save() works
const findUserForOTPVerification = async (email) => {
  return await User.findOne({ email }).select(
    "+otp +otpExpires +password +otpAttempts +accountLockedUntil"
  );
};

// ─────────────────────────────────────────────────────────────
// STEP 1: Send OTP to email before registration
// ─────────────────────────────────────────────────────────────
export const sendRegistrationOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !validateEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser && existingUser.isActivated && existingUser.password) {
      return res.status(400).json({ message: "User already exists" });
    }

    const otp = generateOTP();
    const hashedOTP = await bcrypt.hash(otp, 10);

    if (existingUser) {
      // Refresh OTP for incomplete registration
      existingUser.otp = hashedOTP;
      existingUser.otpExpires = new Date(Date.now() + OTP_EXPIRY);
      existingUser.otpAttempts = 0;
      existingUser.otpAttemptWindowStart = new Date();
      await existingUser.save();
    } else {
      // Create minimal placeholder user
      const placeholderUser = new User({
        email: normalizedEmail,
        otp: hashedOTP,
        otpExpires: new Date(Date.now() + OTP_EXPIRY),
        otpAttempts: 0,
        otpAttemptWindowStart: new Date(),
        isActivated: false,
      });
      await placeholderUser.save();
    }

    try {
      await sendOTPEmail(normalizedEmail, otp);
    } catch (emailError) {
      console.error("Failed to send OTP email:", emailError.message);
      return res.status(500).json({
        message: "Failed to send OTP email. Please try again.",
      });
    }

    return res.status(200).json({
      message: "OTP sent to your email. Please verify to continue.",
      expiresIn: `${OTP_EXPIRY / 60000} minutes`,
    });
  } catch (error) {
    console.error("sendRegistrationOTP Error:", error);
    if (error.code === 11000) {
      return res.status(400).json({ message: "Email already in use" });
    }
    res.status(500).json({
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────
// STEP 2: Verify OTP
// ─────────────────────────────────────────────────────────────
export const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !validateEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: "OTP must be a 6-digit number" });
    }

    // .lean() ensures otp field is not stripped by toJSON transform
    const user = await findUserWithOTP(normalizedEmail);
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (isAccountLocked(user)) {
      const lockTimeRemaining = Math.ceil(
        (new Date(user.accountLockedUntil) - new Date()) / 60000
      );
      return res.status(403).json({
        message: `Account is temporarily locked. Try again in ${lockTimeRemaining} minutes.`,
      });
    }

    if (user.isActivated && user.password) {
      return res.status(400).json({ message: "Account is already registered" });
    }

    if (!user.otp) {
      return res
        .status(400)
        .json({ message: "No OTP found. Please request a new one." });
    }

    if (new Date(user.otpExpires) < new Date()) {
      return res
        .status(400)
        .json({ message: "OTP has expired. Please request a new one." });
    }

    const isMatch = await bcrypt.compare(otp, user.otp);
    if (!isMatch) {
      const attemptResult = await checkOTPAttempts(user);
      if (attemptResult.locked) {
        return res.status(403).json({ message: attemptResult.message });
      }
      return res.status(400).json({
        message: "Invalid OTP",
        remainingAttempts: attemptResult.remainingAttempts,
      });
    }

    // Success — mark email verified, clear OTP, reset attempts
    // Using updateOne since user is a lean (plain) object
    await User.updateOne(
      { email: normalizedEmail },
      {
        $set: {
          isEmailVerified: true,
          otpAttempts: 0,
          otpAttemptWindowStart: null,
          accountLockedUntil: null,
        },
        $unset: { otp: "", otpExpires: "" },
      }
    );

    return res.status(200).json({
      message:
        "Email verified successfully. Please complete your registration.",
      email: normalizedEmail,
    });
  } catch (error) {
    console.error("Verify OTP Error:", error);
    res.status(500).json({
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────
// STEP 3: Complete registration after email verification
// ─────────────────────────────────────────────────────────────
export const completeRegistration = async (req, res) => {
  try {
    const {
      email,
      fullName,
      name,
      password,
      pushToken,
      transactionPIN,
      gender,
      dateOfBirth,
      phoneNumber,
    } = req.body;

    const userName = fullName || name;

    // FIX: original condition used a comma operator, which only evaluated
    // `!phoneNumber` and silently ignored the other checks. This now
    // correctly requires all fields.
    if (!email || !userName || !password || !transactionPIN || !phoneNumber) {
      return res.status(400).json({
        message:
          "Email, name, password, transaction PIN, and phone number are required",
        fields: {
          email: !email,
          fullName: !userName,
          password: !password,
          transactionPIN: !transactionPIN,
          phoneNumber: !phoneNumber,
        },
      });
    }

    if (userName.trim().length < 2) {
      return res
        .status(400)
        .json({ message: "Name must be at least 2 characters" });
    }

    if (!validatePIN(transactionPIN)) {
      return res
        .status(400)
        .json({ message: "Transaction PIN must be 4-6 digits" });
    }

    if (
      gender &&
      !["male", "female", "other", "prefer-not-to-say"].includes(gender)
    ) {
      return res.status(400).json({
        message:
          "Gender must be one of: male, female, other, prefer-not-to-say",
      });
    }

    if (dateOfBirth) {
      const birthDate = new Date(dateOfBirth);
      const today = new Date();

      if (isNaN(birthDate.getTime())) {
        return res
          .status(400)
          .json({ message: "Invalid date format for date of birth" });
      }
      if (birthDate > today) {
        return res
          .status(400)
          .json({ message: "Date of birth cannot be in the future" });
      }

      const age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (age < 13 || (age === 13 && monthDiff < 0)) {
        return res
          .status(400)
          .json({ message: "You must be at least 13 years old to register" });
      }
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !validateEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    if (!validatePassword(password)) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters long" });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({
        message: "No verification found for this email. Please start again.",
      });
    }

    if (!user.isEmailVerified) {
      return res.status(403).json({
        message: "Email not verified. Please verify your email first.",
      });
    }

    if (user.isActivated && user.password) {
      return res.status(400).json({ message: "User already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const hashedPIN = await bcrypt.hash(transactionPIN, 10);

    user.fullName = userName.trim();
    user.password = hashedPassword;
    user.isActivated = true;
    user.isEmailVerified = true;
    user.transactionPIN = hashedPIN;
    user.phoneNumber = phoneNumber.trim();

    if (pushToken) user.pushToken = pushToken;
    if (gender) user.gender = gender;
    if (dateOfBirth) user.dateOfBirth = new Date(dateOfBirth);

    await user.save();

    try {
      await sendWelcomeEmail(user.email, user.fullName);
    } catch (emailError) {
      // Registration already succeeded — don't fail the request over a
      // non-critical welcome email.
      console.error("Failed to send welcome email:", emailError.message);
    }

    return res.status(201).json({
      message: "Registration complete! Welcome aboard.",
    });
  } catch (error) {
    console.error("completeRegistration Error:", error);
    if (error.code === 11000) {
      return res.status(400).json({ message: "Email already in use" });
    }
    res.status(500).json({
      message: "Server error occurred during registration",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────
// Resend OTP
// ─────────────────────────────────────────────────────────────
export const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !validateEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const user = await findUserWithOTP(normalizedEmail);
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    if (isAccountLocked(user)) {
      const lockTimeRemaining = Math.ceil(
        (new Date(user.accountLockedUntil) - new Date()) / 60000
      );
      return res.status(403).json({
        message: `Account is temporarily locked. Try again in ${lockTimeRemaining} minutes.`,
      });
    }

    if (user.isActivated && user.password) {
      return res.status(400).json({ message: "Account is already registered" });
    }

    if (
      user.otpExpires &&
      new Date(user.otpExpires) - new Date() > OTP_EXPIRY - 60000
    ) {
      const waitTime = Math.ceil(
        (new Date(user.otpExpires) - new Date() - (OTP_EXPIRY - 60000)) / 1000
      );
      return res.status(429).json({
        message: `Please wait ${waitTime} seconds before requesting a new OTP.`,
      });
    }

    const otp = generateOTP();
    const hashedOTP = await hashOTP(otp);

    await User.updateOne(
      { email: normalizedEmail },
      {
        $set: {
          otp: hashedOTP,
          otpExpires: new Date(Date.now() + OTP_EXPIRY),
        },
      }
    );

    await sendOTPEmail(normalizedEmail, otp);

    try {
      if (user.pushToken) {
        await sendPushNotification(
          user.pushToken,
          "OTP Resent 🔄",
          `Your OTP is ${otp}`
        );
      }
    } catch (notificationError) {
      console.error("Error sending push notification:", notificationError);
    }

    res.status(200).json({
      message: "OTP sent successfully. Please check your email.",
      expiresIn: `${OTP_EXPIRY / 60000} minutes`,
    });
  } catch (error) {
    console.error("Resend OTP Error:", error);
    res.status(500).json({
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────
// Login
// ─────────────────────────────────────────────────────────────
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !validateEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const user = await User.findOne({ email: normalizedEmail }).select(
      "+password"
    );
    if (!user) {
      return res.status(400).json({ message: "Invalid login details" });
    }

    if (isAccountLocked(user)) {
      const lockTimeRemaining = Math.ceil(
        (new Date(user.accountLockedUntil) - new Date()) / 60000
      );
      return res.status(403).json({
        message: `Account is temporarily locked. Please try again in ${lockTimeRemaining} minutes.`,
      });
    }

    // FIX: guard against placeholder users (OTP requested, registration
    // never completed) who have no password hash yet — bcrypt.compare
    // throws on a non-string hash instead of returning false.
    if (!user.password) {
      return res.status(400).json({ message: "Invalid login details" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // FIX: brute-force protection on password attempts, mirroring the
      // OTP attempt lockout. Requires loginAttempts / loginAttemptWindowStart
      // fields on the schema — see checkLoginAttempts note above.
      const attemptResult = await checkLoginAttempts(user);
      if (attemptResult.locked) {
        return res.status(403).json({ message: attemptResult.message });
      }
      return res.status(400).json({ message: "Invalid login details" });
    }

    if (!user.isActivated) {
      return res.status(400).json({
        message: "Please verify your account first. Check your email for OTP.",
      });
    }

    await resetLoginAttempts(normalizedEmail);

    // FIX: keep the JWT payload identical between login and refresh so
    // anything reading req.user.tag doesn't break after a token refresh.
    const userPayload = { id: user._id, email: user.email, tag: user.tag };
    const token = generateAccessToken(userPayload);
    const refreshToken = generateRefreshToken(userPayload);

    user.refreshToken = refreshToken;
    user.refreshTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await user.save();

    const ipAddress =
      req.ip ||
      req.headers["x-forwarded-for"]?.split(",")[0].trim() ||
      req.connection?.remoteAddress ||
      "Unknown IP";
    const device = req.headers["user-agent"] || "Unknown Device";

    try {
      if (user.pushToken) {
        await sendPushNotification(
          user.pushToken,
          "Login Notification",
          "Login successful."
        );
      }
    } catch (notificationError) {
      console.error("Error sending login notification:", notificationError);
    }

    sendLoginNotification(user.email, ipAddress, device).catch((err) =>
      console.error("Login notification email error:", err)
    );

    res.status(200).json({
      message: "Login successful",
      token,
      refreshToken,
      user: {
        name: user.fullName,
        isWalletCreated: user.isWalletCreated,
        email: user.email,
        phoneNumber: user.phoneNumber,
        profilePicture: user.profilePicture,
        balance: user.balance,
        gender: user.gender,
        dateOfBirth: user.dateOfBirth,
        bankName: user.bankName,
        accountNumber: user.accountNumber,
        jTokens: user.jTokens,
        accountDetails: user.accountDetails || [],
      },
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({
      message: "Server error occurred during login",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────
// Refresh token endpoint for biometric login and token rotation
// ─────────────────────────────────────────────────────────────
export const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token is required" });
    }

    // 1. Verify signature + expiry
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch {
      return res
        .status(401)
        .json({ message: "Invalid or expired session. Please log in again." });
    }

    // 2. Check account lock status (before DB update)
    const user = await User.findById(decoded.id);
    if (!user) {
      return res
        .status(401)
        .json({ message: "Session not recognised. Please log in again." });
    }

    if (isAccountLocked(user)) {
      const lockTimeRemaining = Math.ceil(
        (new Date(user.accountLockedUntil) - new Date()) / 60000
      );
      return res.status(403).json({
        message: `Account is temporarily locked. Please try again in ${lockTimeRemaining} minutes.`,
      });
    }

    // 3. Rotate — atomic update: only if refresh token still matches
    // FIX: keep payload shape identical to loginUser (include tag) so
    // downstream code reading req.user.tag behaves consistently regardless
    // of whether the current token came from login or refresh.
    const userPayload = { id: user._id, email: user.email, tag: user.tag };
    const newAccessToken = generateAccessToken(userPayload);
    const newRefreshToken = generateRefreshToken(userPayload);

    const updatedUser = await User.findOneAndUpdate(
      { _id: decoded.id, refreshToken: refreshToken }, // condition ensures token hasn't changed
      {
        $set: {
          refreshToken: newRefreshToken,
          refreshTokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      },
      { new: true } // return updated document
    );

    if (!updatedUser) {
      // Either user not found or refresh token mismatch (already used)
      return res
        .status(401)
        .json({ message: "Session not recognised. Please log in again." });
    }

    return res.status(200).json({
      token: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error("Refresh Token Error:", error);
    res.status(500).json({
      message: "Server error during token refresh",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────
// Get User
// ─────────────────────────────────────────────────────────────
export const getUser = async (req, res) => {
  try {
    const { email } = req.params;

    if (!email) {
      return res.status(400).json({ message: "Email parameter is required" });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !validateEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const user = await User.findOne({ email: normalizedEmail }).select(
      "email fullName isActivated jTokens profilePicture balance dateOfBirth phoneNumber gender isWalletCreated bankName accountNumber accountDetails"
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("Get User Error:", error);
    res.status(500).json({
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────
// Set Profile Picture
// ─────────────────────────────────────────────────────────────
export const setProfilePicture = async (req, res) => {
  try {
    const { email, profilePicture } = req.body;

    if (!email || !profilePicture) {
      return res
        .status(400)
        .json({ message: "Email and profile picture are required" });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !validateEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    if (
      typeof profilePicture !== "string" ||
      profilePicture.trim().length === 0
    ) {
      return res
        .status(400)
        .json({ message: "Invalid profile picture format" });
    }

    const user = await User.findOneAndUpdate(
      { email: normalizedEmail },
      { profilePicture: profilePicture.trim() },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Profile picture updated successfully",
      profilePicture: user.profilePicture,
    });
  } catch (error) {
    console.error("Set Profile Picture Error:", error);
    return res.status(500).json({
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────
// Get Wallet Balance
// ─────────────────────────────────────────────────────────────
export const getWalletBalance = async (req, res) => {
  try {
    const { email } = req.params;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !validateEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const user = await User.findOne({ email: normalizedEmail }).select(
      "balance"
    );
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ data: user.balance || 0, currency: "NGN" });
  } catch (error) {
    console.error("Error fetching wallet balance:", error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────
// Send Transaction OTP
// ─────────────────────────────────────────────────────────────
export const sendTransactionOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !validateEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (isAccountLocked(user)) {
      const lockTimeRemaining = Math.ceil(
        (new Date(user.accountLockedUntil) - new Date()) / 60000
      );
      return res.status(403).json({
        message: `Account is temporarily locked. Try again in ${lockTimeRemaining} minutes.`,
      });
    }

    if (!user.isActivated) {
      return res
        .status(400)
        .json({ message: "Please activate your account first" });
    }

    if (
      user.otpExpires &&
      new Date(user.otpExpires) - new Date() > OTP_EXPIRY - 60000
    ) {
      const waitTime = Math.ceil(
        (new Date(user.otpExpires) - new Date() - (OTP_EXPIRY - 60000)) / 1000
      );
      return res.status(429).json({
        message: `Please wait ${waitTime} seconds before requesting a new OTP.`,
      });
    }

    const otp = generateOTP();
    user.otp = await hashOTP(otp);
    user.otpExpires = new Date(Date.now() + OTP_EXPIRY);
    await user.save();

    await sendOTPEmail(normalizedEmail, otp);

    try {
      if (user.pushToken) {
        await sendPushNotification(
          user.pushToken,
          "Transaction OTP 🔄",
          `Your OTP is ${otp}`
        );
      }
    } catch (notificationError) {
      console.error("Error sending push notification:", notificationError);
    }

    res.status(200).json({
      message: "Transaction OTP sent successfully",
      expiresIn: `${OTP_EXPIRY / 60000} minutes`,
    });
  } catch (error) {
    console.error("Send Transaction OTP Error:", error);
    res.status(500).json({
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────
// Send Reset Password OTP
// ─────────────────────────────────────────────────────────────
export const sendResetOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !validateEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const user = await findUserWithOTP(normalizedEmail);
    if (!user) {
      // Security: don't reveal if user exists
      return res.status(200).json({
        message:
          "If an account exists with this email, a password reset OTP has been sent.",
      });
    }

    if (isAccountLocked(user)) {
      const lockTimeRemaining = Math.ceil(
        (new Date(user.accountLockedUntil) - new Date()) / 60000
      );
      return res.status(403).json({
        message: `Account is temporarily locked. Try again in ${lockTimeRemaining} minutes.`,
      });
    }

    if (
      user.otpExpires &&
      new Date(user.otpExpires) - new Date() > OTP_EXPIRY - 60000
    ) {
      const waitTime = Math.ceil(
        (new Date(user.otpExpires) - new Date() - (OTP_EXPIRY - 60000)) / 1000
      );
      return res.status(429).json({
        message: `Please wait ${waitTime} seconds before requesting a new OTP.`,
      });
    }

    const otp = generateOTP();
    const hashedOTP = await hashOTP(otp);

    await User.updateOne(
      { email: normalizedEmail },
      {
        $set: {
          otp: hashedOTP,
          otpExpires: new Date(Date.now() + OTP_EXPIRY),
        },
      }
    );

    await sendOTPEmail(normalizedEmail, otp);

    try {
      if (user.pushToken) {
        await sendPushNotification(
          user.pushToken,
          "Password Reset OTP 🔄",
          `Your OTP is ${otp}`
        );
      }
    } catch (notificationError) {
      console.error("Error sending push notification:", notificationError);
    }

    res.status(200).json({
      message: "Password reset OTP sent successfully",
      expiresIn: `${OTP_EXPIRY / 60000} minutes`,
    });
  } catch (error) {
    console.error("Send Reset Password OTP Error:", error);
    res.status(500).json({
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────
// Verify Reset OTP and Update Password
// ─────────────────────────────────────────────────────────────
export const verifyResetOTP = async (req, res) => {
  try {
    const { email, otp, password } = req.body;

    if (!email || !otp || !password) {
      return res
        .status(400)
        .json({ message: "Email, OTP, and new password are required" });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !validateEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    if (!validatePassword(password)) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters long" });
    }

    // Not lean — needs save()
    const user = await findUserForOTPVerification(normalizedEmail);
    if (!user) {
      return res.status(400).json({ message: "Invalid request" });
    }

    if (isAccountLocked(user)) {
      const lockTimeRemaining = Math.ceil(
        (new Date(user.accountLockedUntil) - new Date()) / 60000
      );
      return res.status(403).json({
        message: `Account is temporarily locked. Try again in ${lockTimeRemaining} minutes.`,
      });
    }

    if (!user.otp || user.otp === "undefined" || user.otp === "null") {
      return res
        .status(400)
        .json({ message: "No OTP found. Please request a password reset." });
    }

    if (!user.otpExpires || new Date(user.otpExpires) < new Date()) {
      return res
        .status(400)
        .json({ message: "OTP has expired. Please request a new one." });
    }

    const isMatch = await bcrypt.compare(otp, user.otp);
    if (!isMatch) {
      const attemptResult = await checkOTPAttempts(user);
      if (attemptResult.locked) {
        return res.status(403).json({ message: attemptResult.message });
      }
      return res.status(400).json({
        message: "Invalid OTP",
        remainingAttempts: attemptResult.remainingAttempts,
      });
    }

    // FIX: guard bcrypt.compare against users with no password set yet
    // (e.g. reset requested on an incomplete registration).
    if (user.password) {
      const isSamePassword = await bcrypt.compare(password, user.password);
      if (isSamePassword) {
        return res.status(400).json({
          message: "New password must be different from the old password",
        });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    user.otp = null;
    user.otpExpires = null;
    user.otpAttempts = 0;
    user.otpAttemptWindowStart = null;
    user.accountLockedUntil = null;
    await user.save();

    res.status(200).json({
      message:
        "Password updated successfully. You can now login with your new password.",
    });
  } catch (error) {
    console.error("Verify Reset OTP Error:", error);
    res.status(500).json({
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────
// Delete User by Email
// ─────────────────────────────────────────────────────────────
export const deleteUserByEmail = async (req, res) => {
  try {
    const { email } = req.params;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !validateEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const user = await User.findOneAndDelete({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete User Error:", error);
    return res.status(500).json({
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────
// Update Phone Number
// ─────────────────────────────────────────────────────────────
export const updatePhoneNumber = async (req, res) => {
  try {
    const { email, phoneNumber } = req.body;

    if (!email || !phoneNumber) {
      return res
        .status(400)
        .json({ message: "Email and phone number are required" });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !validateEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const user = await User.findOneAndUpdate(
      { email: normalizedEmail },
      { phoneNumber },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      message: "Phone number updated successfully",
      phoneNumber: user.phoneNumber,
    });
  } catch (error) {
    console.error("Update Phone Number Error:", error);
    return res.status(500).json({
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ─────────────────────────────────────────────────────────────
// Update User Profile
// ─────────────────────────────────────────────────────────────
export const updateUserProfile = async (req, res) => {
  try {
    const { email } = req.params;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !validateEmail(normalizedEmail)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const {
      fullName,
      phoneNumber,
      gender,
      dateOfBirth,
      profilePicture,
      pushToken,
    } = req.body;

    // At least one field must be provided
    if (
      !fullName &&
      !phoneNumber &&
      !gender &&
      !dateOfBirth &&
      !profilePicture &&
      !pushToken
    ) {
      return res.status(400).json({ message: "No fields provided to update" });
    }

    const updates = {};

    if (fullName !== undefined) {
      if (typeof fullName !== "string" || fullName.trim().length < 2) {
        return res
          .status(400)
          .json({ message: "Name must be at least 2 characters" });
      }
      updates.fullName = fullName.trim();
    }

    if (phoneNumber !== undefined) {
      if (typeof phoneNumber !== "string" || phoneNumber.trim().length < 7) {
        return res.status(400).json({ message: "Invalid phone number" });
      }
      updates.phoneNumber = phoneNumber.trim();
    }

    if (gender !== undefined) {
      if (!["male", "female", "other", "prefer-not-to-say"].includes(gender)) {
        return res.status(400).json({
          message:
            "Gender must be one of: male, female, other, prefer-not-to-say",
        });
      }
      updates.gender = gender;
    }

    if (dateOfBirth !== undefined) {
      const birthDate = new Date(dateOfBirth);
      const today = new Date();

      if (isNaN(birthDate.getTime())) {
        return res
          .status(400)
          .json({ message: "Invalid date format for date of birth" });
      }
      if (birthDate > today) {
        return res
          .status(400)
          .json({ message: "Date of birth cannot be in the future" });
      }

      const age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (age < 13 || (age === 13 && monthDiff < 0)) {
        return res
          .status(400)
          .json({ message: "You must be at least 13 years old" });
      }

      updates.dateOfBirth = birthDate;
    }

    if (profilePicture !== undefined) {
      if (
        typeof profilePicture !== "string" ||
        profilePicture.trim().length === 0
      ) {
        return res
          .status(400)
          .json({ message: "Invalid profile picture format" });
      }
      updates.profilePicture = profilePicture.trim();
    }

    if (pushToken !== undefined) {
      updates.pushToken = pushToken;
    }

    updates.updatedAt = new Date();

    const user = await User.findOneAndUpdate(
      { email: normalizedEmail },
      { $set: updates },
      { new: true, runValidators: true }
    ).select("fullName phoneNumber gender dateOfBirth profilePicture email");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        name: user.fullName,
        email: user.email,
        phoneNumber: user.phoneNumber,
        gender: user.gender,
        dateOfBirth: user.dateOfBirth,
        profilePicture: user.profilePicture,
      },
    });
  } catch (error) {
    console.error("Update User Profile Error:", error);
    return res.status(500).json({
      message: "Server error",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
