import rateLimit from "express-rate-limit";
import type { Request } from "express";

const NODE_ENV = process.env.NODE_ENV || "development";

const resolveClientIp = (req: Request): string => {
  const forwardedFor = req.headers["x-forwarded-for"];
  const forwarded = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  return (
    req.ip ||
    forwarded?.split(",")[0]?.trim() ||
    (req.headers["x-real-ip"] as string | undefined) ||
    req.socket.remoteAddress ||
    "unknown"
  );
};

// 📈 Global Rate Limiting - Basic protection
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: NODE_ENV === "production" ? 200 : 1000, // Increased from 100
  message: {
    error: "Too many requests from this IP, please try again later.",
    retryAfter: "15 minutes",
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  // Use IP from proxy headers (important for production behind load balancer)
  keyGenerator: resolveClientIp,
  // Skip rate limiting for specific routes
  skip: (req) => {
    // Skip health checks and webhooks
    return req.path === "/health" || req.path.startsWith("/api/v1/webhook");
  },
  // Custom handler for rate limit exceeded
  handler: (req, res) => {
    console.warn(`⚠️ Rate limit exceeded for IP: ${req.ip}`);
    // express-rate-limit augments Request with `rateLimit` at runtime;
    // depending on how its ambient types get picked up this isn't
    // always visible to the compiler, so read it defensively here.
    const rateLimitInfo = (req as Request & {
      rateLimit?: { resetTime?: Date; limit?: number; current?: number };
    }).rateLimit;
    res.status(429).json({
      error: "Too many requests",
      message: "You have exceeded the rate limit. Please try again later.",
      retryAfter: Math.ceil((rateLimitInfo?.resetTime?.getTime() ?? Date.now()) / 1000), // seconds
      limit: rateLimitInfo?.limit,
      current: rateLimitInfo?.current,
    });
  },
});

// 🔐 Auth Routes - Stricter limits
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: NODE_ENV === "production" ? 10 : 50, // Much stricter for auth
  message: {
    error: "Too many authentication attempts, please try again later.",
    retryAfter: "15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Don't count successful requests
  keyGenerator: resolveClientIp,
});

// 💸 Transaction Routes - Moderate limits
const transactionLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: NODE_ENV === "production" ? 10 : 50, // 10 transactions per minute
  message: {
    error: "Too many transaction attempts, please slow down.",
    retryAfter: "1 minute",
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use both IP and user ID for authenticated routes
    const userId = req.user?.id || req.user?.email || "anonymous";
    const ip = resolveClientIp(req);
    return `${ip}-${userId}`;
  },
});

// 🔔 Push Notification Routes - Relaxed limits
const notificationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: NODE_ENV === "production" ? 30 : 100,
  message: {
    error: "Too many notification requests, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 📊 Export all limiters
export { globalLimiter, authLimiter, transactionLimiter, notificationLimiter };

export default globalLimiter;
