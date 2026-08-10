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
import AdminRouter from "./admin/routes/admin.js";
import jTokensRouter from "./routes/jTokens.js";
import voucherRouter from "./routes/voucher.js";
import webhookRouter from "./routes/webhook.js";
import { verifyToken } from "./middleware/verifyToken.js";
import { errorHandler } from "./middleware/version2/errorHandler.js";
import { requestLogger } from "./middleware/version2/requestLogger.js";
import { globalLimiter, authLimiter } from "./utils/version2/rateLimiter.js";

//admin routes
import AdminAuthRouter from "./admin/routes/auth.js";
import AdminFunding from "./admin/routes/fundings.js";
import AdminServices from "./admin/routes/services.js";
import AdminSettings from "./admin/routes/settings.js";
import AdminTransactions from "./admin/routes/transactions.js";
import userManagementRouter from "./admin/routes/userManagement.js";
import { verifyAdminToken } from "./admin/middleware/verifyAdminToken.js";


dotenv.config();

const app = express();
const NODE_ENV = process.env.NODE_ENV || "development";

const allowedOrigins = [
  "https://api.depay.com.ng",
  "http://localhost:3000",
  "https://depay.com.ng",
  "https://admin.depay.com.ng",
];

// ── CORS manual header ────────────────────────────────
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,DELETE,PATCH,OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization,X-Requested-With"
  );
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ── Security ──────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false,
    contentSecurityPolicy: false,
  })
);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  credentials: false,
  maxAge: 86400,
};

app.options("*", cors(corsOptions));
app.use(cors(corsOptions));

// ── Compression ───────────────────────────────────────
app.use(compression());

// ── Rate limiting ─────────────────────────────────────
app.set("trust proxy", true);
app.use(globalLimiter);

// ── Parsing ───────────────────────────────────────────
app.use(
  express.json({
    limit: "10mb",
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── Logging ───────────────────────────────────────────
app.use(requestLogger);

// ── DB connection (cached for serverless) ─────────────
let isConnected = false;
const ensureDb = async (req, res, next) => {
  if (!isConnected) {
    try {
      await connectToDb();
      isConnected = true;
    } catch (err) {
      console.error("DB connection failed:", err);
      return res.status(500).json({ error: "Database connection failed" });
    }
  }
  next();
};
app.use(ensureDb);

// ── Health check ──────────────────────────────────────
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    note: "Socket.IO not available on Vercel",
  });
});

// ── Public routes ─────────────────────────────────────
app.use("/api/v1/user", authLimiter, userRouter);
app.use("/api/v1", webhookRouter);

// ── Protected routes ──────────────────────────────────
app.use("/api/v1/wallet", verifyToken, accountRouter);
app.use("/api/v1/bills", billsController);
app.use("/api/v1", verificationRouter);
app.use("/api/v1/PIN", PINRouter);
app.use("/api/v1/jtokens", jTokensRouter);
app.use("/api/v1/voucher", voucherRouter);



// ── Admin routes ──────────────────────────────────────
app.use("/api/v1/admin/auth", AdminAuthRouter);
app.use("/api/v1/admin/users", verifyAdminToken, userManagementRouter);
app.use("/api/v1/admin", verifyAdminToken, AdminRouter);
app.use("/api/v1/admin/fundings", verifyAdminToken, AdminFunding);
app.use("/api/v1/admin/services", verifyAdminToken, AdminServices);
app.use("/api/v1/admin/settings", verifyAdminToken, AdminSettings);
app.use("/api/v1/admin/transactions", verifyAdminToken, AdminTransactions);

// ── 404 ───────────────────────────────────────────────
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
    method: req.method,
  });
});

// ── Error handler ─────────────────────────────────────
app.use(errorHandler);

// ── Start server (always) ────────────────────────────
const PORT = process.env.PORT || 8080;
const { createServer } = await import("http");
const server = createServer(app);
await connectToDb(); // ensure DB is ready before listening
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
