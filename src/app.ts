import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import type { CorsOptions } from "cors";

import userRouter from "./routes/user.js";
import { connectToDb } from "./database/connectToDb.js";
import accountRouter from "./routes/wallet.js";
import billsController from "./routes/bills.js";
import verificationRouter from "./routes/verification.js";
import PINRouter from "./routes/PIN.js";
import jTokensRouter from "./routes/jTokens.js";
import voucherRouter from "./routes/voucher.js";
import webhookRouter from "./routes/webhook.js";
import internalRouter from "./routes/internal.js";

import AdminRouter from "./admin/routes/admin.js";
import AdminAuthRouter from "./admin/routes/auth.js";
import AdminFunding from "./admin/routes/fundings.js";
import AdminServices from "./admin/routes/services.js";
import AdminSettings from "./admin/routes/settings.js";
import AdminTransactions from "./admin/routes/transactions.js";
import userManagementRouter from "./admin/routes/userManagement.js";

import { verifyToken } from "./middleware/verifyToken.js";
import { verifyAdminToken } from "./admin/middleware/verifyAdminToken.js";

import { errorHandler } from "./middleware/version2/errorHandler.js";
import { requestLogger } from "./middleware/version2/requestLogger.js";

import { globalLimiter, authLimiter } from "./utils/version2/rateLimiter.js";
import { queueWorker } from "./service/version2/queueWorker.js";

dotenv.config();

const app = express();

const NODE_ENV = process.env.NODE_ENV || "development";

/*
|--------------------------------------------------------------------------
| Process-level crash protection
|--------------------------------------------------------------------------
| Without these, a single unhandled promise rejection anywhere in the
| codebase (a fire-and-forget notification call, a stray async callback,
| a third-party library bug) crashes the entire Node process — taking
| down every one of the concurrently connected users' requests, not just
| the one that triggered it. This is especially important now that
| several code paths intentionally fire-and-forget non-critical work
| (JToken awards, revenue updates, push notifications) with a `.catch()`
| — this is a second line of defense in case a `.catch()` is ever missed
| on a new code path. We log and keep running rather than exiting, since
| for an Express server the operational cost of an unplanned exit
| (dropping every in-flight request, however many hundreds there might
| be at 1000+ concurrent users) is generally worse than continuing after
| logging — the errorHandler middleware below still catches anything
| that surfaces through a request.
*/
process.on("unhandledRejection", (reason, promise) => {
  console.error("🔥 Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("🔥 Uncaught Exception:", error);
});

//Core setup

const allowedOrigins = [
  "https://api.depay.com.ng",
  "https://depay.com.ng",
  "https://admin.depay.com.ng",
  "http://localhost:3000",
];

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests without an Origin header
    // e.g. Postman, server-to-server requests, mobile apps
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      console.log(`✅ CORS allowed: ${origin}`);
      return callback(null, true);
    }

    console.log(`❌ CORS blocked: ${origin}`);

    return callback(new Error(`CORS blocked: ${origin}`));
  },

  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],

  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],

  credentials: false,

  maxAge: 86400,
};

app.use(cors(corsOptions));

//security headers

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },

    crossOriginOpenerPolicy: false,

    contentSecurityPolicy: false,
  }),
);

//compression
app.use(compression());

//proxy

app.set("trust proxy", true);

//rate limiting

app.use(globalLimiter);

//body parsing

app.use(
  express.json({
    limit: "10mb",

    verify: (req, _res, buf) => {
      (req as express.Request).rawBody = buf;
    },
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  }),
);

//request logging

app.use(requestLogger);

//public health check

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
  });
});

//unprotected routes

// User authentication
app.use("/api/v1/user", authLimiter, userRouter);

// Webhooks
app.use("/api/v1", webhookRouter);

// Background job manual-trigger endpoint (optional — see
// routes/internal.js; the worker below already runs continuously).
app.use("/api/v1/internal", internalRouter);

//protected routes

// Wallet
app.use("/api/v1/wallet", verifyToken, accountRouter);

// Bills
//

app.use("/api/v1/bills", verifyToken, billsController);

// Verification
app.use("/api/v1", verificationRouter);

// PIN
app.use("/api/v1/PIN", PINRouter);

// J-Tokens

app.use("/api/v1/jtokens", verifyToken, jTokensRouter);

// Voucher

app.use("/api/v1/voucher", verifyToken, voucherRouter);

//admin endpoints routes

// Admin authentication
app.use("/api/v1/admin/auth", AdminAuthRouter);

// Admin users
app.use("/api/v1/admin/users", verifyAdminToken, userManagementRouter);

// General admin routes
app.use("/api/v1/admin", verifyAdminToken, AdminRouter);

// Admin funding
app.use("/api/v1/admin/fundings", verifyAdminToken, AdminFunding);

// Admin services
app.use("/api/v1/admin/services", verifyAdminToken, AdminServices);

// Admin settings
app.use("/api/v1/admin/settings", verifyAdminToken, AdminSettings);

// Admin transactions
app.use("/api/v1/admin/transactions", verifyAdminToken, AdminTransactions);

//404 handler

app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
    method: req.method,
  });
});

app.use(errorHandler);

const PORT = Number(process.env.PORT) || 8080;

const { createServer } = await import("http");

const server = createServer(app);

// Connect to database before starting server
await connectToDb();

if (process.env.RUN_BACKGROUND_WORKER !== "false") {
  queueWorker.start();
  queueWorker.setupGracefulShutdown();
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${NODE_ENV}`);
});

export default app;
