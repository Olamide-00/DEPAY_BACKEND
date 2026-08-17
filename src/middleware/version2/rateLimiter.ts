import rateLimit from "express-rate-limit";

export const accountCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many account creation requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for admin users if needed
    return (req.user as (typeof req.user & { isAdmin?: boolean }) | undefined)?.isAdmin === true;
  },
  keyGenerator: (req) => {
    // Use user ID instead of IP for authenticated requests
    return req.user?.id || req.ip || "unknown";
  },
});
