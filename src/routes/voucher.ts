import express from "express";
import {
  checkVoucher,
  createVoucher,
  redeemVoucher,
} from "../controller/version2/voucher/voucher.js";
import { transactionLimiter } from "../utils/version2/rateLimiter.js";

const router = express.Router();

router.post("/create", transactionLimiter, createVoucher);
router.post("/claim", transactionLimiter, redeemVoucher);
router.get("/check", checkVoucher);

export default router;
