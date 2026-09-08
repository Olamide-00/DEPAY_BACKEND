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
router.get("/ledger", getMyLedger);

export default router;
