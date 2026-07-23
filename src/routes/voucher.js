import express from "express";
import {
  checkVoucher,
  createVoucher,
  redeemVoucher,
} from "../controller/version2/voucher/voucher.js";

const router = express.Router();

router.post("/create", createVoucher);
router.post("/claim", redeemVoucher);
router.get("/check", checkVoucher);

export default router;
