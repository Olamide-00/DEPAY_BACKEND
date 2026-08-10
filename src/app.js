import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";

import userRouter from "./routes/user.js";
import { connectToDb } from "./database/connectToDb.js";
import accountRouter from "./routes/wallet.js";
import billsController from "./routes/bills.js";
import verificationRouter from "./routes/verification.js";
import PINRouter from "./routes/PIN.js";
import jTokensRouter from "./routes/jTokens.js";
import voucherRouter from "./routes/voucher.js";
import webhookRouter from "./routes/webhook.js";

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

dotenv.config();

const app = express();

const NODE_ENV = process.env.NODE_ENV || "development";

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

const corsOptions = {
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

    verify: (req, res, buf) => {
      req.rawBody = buf;
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
*/

let isConnected = false;

const ensureDb = async (req, res, next) => {
  if (!isConnected) {
    try {
      await connectToDb();

      isConnected = true;

      console.log("✅ Database connected");
    } catch (error) {
      console.error("❌ Database connection failed:", error);

      return res.status(500).json({
        error: "Database connection failed",
      });
    }
  }

  next();
};

app.use(ensureDb);

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
    note: "Socket.IO not available on Vercel",
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

/*
|--------------------------------------------------------------------------
| Protected User Routes
|--------------------------------------------------------------------------
*/

// Wallet
app.use("/api/v1/wallet", verifyToken, accountRouter);

// Bills
app.use("/api/v1/bills", billsController);

// Verification
app.use("/api/v1", verificationRouter);

// PIN
app.use("/api/v1/PIN", PINRouter);

// J-Tokens
app.use("/api/v1/jtokens", jTokensRouter);

// Voucher
app.use("/api/v1/voucher", voucherRouter);

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

const PORT = process.env.PORT || 8080;

const { createServer } = await import("http");

const server = createServer(app);

// Connect to database before starting server
await connectToDb();

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${NODE_ENV}`);
});

export default app;
