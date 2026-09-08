import type { Request, Response } from "express";
import User, { type UserDocument } from "../../../models/users.js";
import bcrypt from "bcryptjs";

// Configuration
const CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000, // ms
  CACHE_TTL: 5 * 60 * 1000, // 5 minutes
  PIN_HASH_ROUNDS: 12,
  MAX_PIN_ATTEMPTS: 5,
  PIN_ATTEMPT_WINDOW: 15 * 60 * 1000, // 15 minutes
};

interface CacheItem<T> {
  value: T;
  expiry: number;
}

// In-memory cache with auto-clear
class AutoClearCache<T> {
  private cache = new Map<string, CacheItem<T>>();
  private ttl: number;

  constructor(ttl = CONFIG.CACHE_TTL) {
    this.ttl = ttl;
  }

  set(key: string, value: T): void {
    this.cache.set(key, {
      value,
      expiry: Date.now() + this.ttl,
    });
  }

  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
      }
    }
  }
}

// Cache instances
const userCache = new AutoClearCache<UserDocument>();
const pinAttemptCache = new AutoClearCache<number>(CONFIG.PIN_ATTEMPT_WINDOW);

// Use the same utility functions from your user controller
const normalizeEmail = (email: unknown): string | null => {
  if (!email || typeof email !== "string") return null;
  return email.trim().toLowerCase();
};

const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

interface RetryableError extends Error {
  code?: number;
}

// Retry logic with exponential backoff
const retryOperation = async <T>(
  operation: () => Promise<T>,
  maxRetries = CONFIG.MAX_RETRIES,
): Promise<T> => {
  let lastError: RetryableError | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as RetryableError;

      // Don't retry on certain errors
      if (lastError.name === "ValidationError" || lastError.code === 11000) {
        throw lastError;
      }

      if (attempt < maxRetries) {
        const delay = CONFIG.RETRY_DELAY * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
};

// Security: Rate limiting for PIN attempts
const checkPinAttempts = (email: string): number => {
  const attempts = pinAttemptCache.get(email) || 0;
  if (attempts >= CONFIG.MAX_PIN_ATTEMPTS) {
    throw new Error("Too many PIN attempts. Please try again later.");
  }
  return attempts;
};

const incrementPinAttempts = (email: string): void => {
  const attempts = (pinAttemptCache.get(email) || 0) + 1;
  pinAttemptCache.set(email, attempts);
};

const resetPinAttempts = (email: string): void => {
  pinAttemptCache.delete(email);
};

// user lookup with caching
const findUserByEmail = async (email: string): Promise<UserDocument | null> => {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !validateEmail(normalizedEmail)) {
    throw new Error("Invalid email address");
  }

  // Check cache first
  const cacheKey = `user:${normalizedEmail}`;
  const cachedUser = userCache.get(cacheKey);
  if (cachedUser) {
    return cachedUser;
  }

  const user = await retryOperation(() =>
    User.findOne({ email: normalizedEmail }),
  );

  if (user) {
    userCache.set(cacheKey, user);
  }

  return user;
};

// Set transaction PIN with all enhancements
export const setPIN = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const { email, pin } = req.body;

    if (!email || !pin) {
      return res.status(400).json({
        success: false,
        message: "Email and transaction pin are required",
      });
    }

    // PIN validation
    if (pin.length < 4) {
      return res.status(400).json({
        success: false,
        message: "PIN must be at least 4 characters long",
      });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !validateEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address",
      });
    }

    const hashedPin = await retryOperation(() =>
      bcrypt.hash(pin, CONFIG.PIN_HASH_ROUNDS),
    );

    const user = await retryOperation(() =>
      User.findOneAndUpdate(
        { email: normalizedEmail },
        { transactionPIN: hashedPin },
        { new: true, runValidators: true },
      ),
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Clear cache for this user and reset attempts
    userCache.delete(`user:${normalizedEmail}`);
    resetPinAttempts(normalizedEmail);

    return res.status(200).json({
      success: true,
      message: "Transaction pin set successfully",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error in setPIN:", message);

    if (message.includes("Invalid email")) {
      return res.status(400).json({
        success: false,
        message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Verify transaction PIN with all enhancements
export const verifyPIN = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const { email, pin } = req.body;

    if (!email || !pin) {
      return res.status(400).json({
        success: false,
        message: "Email and transaction pin are required",
      });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !validateEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address",
      });
    }

    // Check rate limiting
    checkPinAttempts(normalizedEmail);

    const user = await findUserByEmail(normalizedEmail);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (!user.transactionPIN) {
      return res.status(400).json({
        success: false,
        message: "Transaction PIN not set for this user",
      });
    }

    const isMatch = await retryOperation(() =>
      bcrypt.compare(pin, user.transactionPIN as string),
    );

    if (isMatch) {
      resetPinAttempts(normalizedEmail);
      return res.status(200).json({
        success: true,
        message: "Transaction pin verified successfully",
      });
    } else {
      incrementPinAttempts(normalizedEmail);
      return res.status(401).json({
        success: false,
        message: "Invalid transaction pin",
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error in verifyPIN:", message);

    if (message.includes("Too many PIN attempts")) {
      return res.status(429).json({
        success: false,
        message,
      });
    }

    if (message.includes("Invalid email")) {
      return res.status(400).json({
        success: false,
        message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Update transaction PIN with all enhancements
export const updatePIN = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const { newPin } = req.body;
    const { email } = req.body;

    if (!email || !newPin) {
      return res.status(400).json({
        success: false,
        message: "Email  and new PIN are required",
      });
    }

    if (newPin.length < 4) {
      return res.status(400).json({
        success: false,
        message: "New PIN must be at least 4 characters long",
      });
    }

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !validateEmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address",
      });
    }

    const user = await findUserByEmail(normalizedEmail);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const hashedNewPin = await retryOperation(() =>
      bcrypt.hash(newPin, CONFIG.PIN_HASH_ROUNDS),
    );

    user.transactionPIN = hashedNewPin;
    user.otp = null;
    user.otpExpires = null;

    await retryOperation(() => user.save());

    // Clear cache for this user and reset attempts
    userCache.delete(`user:${normalizedEmail}`);
    resetPinAttempts(normalizedEmail);

    return res.status(200).json({
      success: true,
      message: "Transaction PIN updated successfully",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error in updatePIN:", message);

    if (message.includes("Invalid email")) {
      return res.status(400).json({
        success: false,
        message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// Periodic cache cleanup (runs every hour)
setInterval(
  () => {
    userCache.cleanup();
    pinAttemptCache.cleanup();
  },
  60 * 60 * 1000,
);

// Export for testing
export const testing = {
  userCache,
  pinAttemptCache,
  retryOperation,
  findUserByEmail,
};
