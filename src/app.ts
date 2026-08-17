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

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| Security
|--------------------------------------------------------------------------
*/

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },

    crossOriginOpenerPolicy: false,

    contentSecurityPolicy: false,
  }),
);

/*
|--------------------------------------------------------------------------
| Compression
|--------------------------------------------------------------------------
*/

app.use(compression());

/*
|--------------------------------------------------------------------------
| Trust Proxy
|--------------------------------------------------------------------------
*/

app.set("trust proxy", true);

/*
|--------------------------------------------------------------------------
| Rate Limiting
|--------------------------------------------------------------------------
*/

app.use(globalLimiter);

/*
|--------------------------------------------------------------------------
| Body Parsing
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| Request Logging
|--------------------------------------------------------------------------
*/

app.use(requestLogger);

/*
|--------------------------------------------------------------------------
| Database Connection
|--------------------------------------------------------------------------
| Render runs this as a persistent, always-on process (not a serverless
| function), so the connection is established once at boot — see
| `await connectToDb()` further down, right before `server.listen()`.
| There's no per-request "connect if not already connected" middleware
| needed here; that pattern exists to handle serverless cold starts and
| isn't relevant on Render.
*/

/*
|--------------------------------------------------------------------------
| Health Check
|--------------------------------------------------------------------------
*/

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
  });
});

/*
|--------------------------------------------------------------------------
| Public Routes
|--------------------------------------------------------------------------
*/

// User authentication
app.use("/api/v1/user", authLimiter, userRouter);

// Webhooks
app.use("/api/v1", webhookRouter);

// Background job manual-trigger endpoint (optional — see
// routes/internal.js; the worker below already runs continuously).
app.use("/api/v1/internal", internalRouter);

/*
|--------------------------------------------------------------------------
| Protected User Routes
|--------------------------------------------------------------------------
*/

// Wallet
app.use("/api/v1/wallet", verifyToken, accountRouter);

// Bills
//
// SECURITY FIX: this router was previously mounted with no auth
// middleware at all — pay-bill, get-bills-history, etc. trusted
// whatever `email` the client put in the request body/URL. Anyone
// who knew (or guessed) a user's email could pay bills out of that
// user's wallet or read their transaction history. verifyToken is
// now required, and the controllers use req.user.email as the
// source of truth instead of the client-supplied one (see
// serviceController.js).
app.use("/api/v1/bills", verifyToken, billsController);

// Verification
app.use("/api/v1", verificationRouter);

// PIN
app.use("/api/v1/PIN", PINRouter);

// J-Tokens
//
// SECURITY FIX: same issue as bills above — convert-jtokens trusted
// a client-supplied email with no auth check, letting anyone convert
// JTokens (and the naira they're worth) out of any account.
app.use("/api/v1/jtokens", verifyToken, jTokensRouter);

// Voucher
//
// SECURITY FIX: same issue — voucher creation/redemption trusted a
// client-supplied email with no auth check.
app.use("/api/v1/voucher", verifyToken, voucherRouter);

/*
|--------------------------------------------------------------------------
| Admin Routes
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| 404 Handler
|--------------------------------------------------------------------------
*/

app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
    method: req.method,
  });
});

/*
|--------------------------------------------------------------------------
| Global Error Handler
|--------------------------------------------------------------------------
*/

app.use(errorHandler);

/*
|--------------------------------------------------------------------------
| Start Server
|--------------------------------------------------------------------------
*/

const PORT = Number(process.env.PORT) || 8080;

const { createServer } = await import("http");

const server = createServer(app);

// Connect to database before starting server
await connectToDb();

// Background job worker — a continuous setInterval poll loop. Render
// runs this as a persistent, always-on process, so this is exactly
// the right place for it (this would NOT be safe on a serverless
// platform like Vercel — see the git history / LEDGER_MIGRATION.md
// if you ever move off Render, since that constraint would come back).
// Starts by default; set RUN_BACKGROUND_WORKER=false to disable —
// e.g. if you later split this into multiple Render instances behind
// a load balancer and want only a dedicated single instance/service
// polling the queue, to avoid every instance processing it in
// parallel (the worker's job-claim is atomic — see queueWorker.js —
// so running it on every instance is safe, just redundant).
if (process.env.RUN_BACKGROUND_WORKER !== "false") {
  queueWorker.start();
  queueWorker.setupGracefulShutdown();
}

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${NODE_ENV}`);
});

export default app;
