import express from "express";
import { createReservedAccountController } from "../controller/version2/wallet/createAccount.js";
import { getMyLedger } from "../controller/version2/wallet/ledgerController.js";
import { accountCreationLimiter } from "../middleware/version2/rateLimiter.js";

const router = express.Router();

router.post(
  "/create-account",
  accountCreationLimiter,
  createReservedAccountController,
);

// Full wallet statement for the logged-in user — every credit/debit
// that ever touched their balance, in order, with a running balance
// snapshot per row. This router is mounted behind verifyToken in
// app.js, so req.user is always populated here.
router.get("/ledger", getMyLedger);

export default router;
