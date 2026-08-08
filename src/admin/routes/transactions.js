import express from "express";
import {
  getTransactions,
  getTransactionById,
  updateTransactionStatus,
} from "../controller/transactions.js";

const router = express.Router();

router.get("/", getTransactions);
router.get("/:id", getTransactionById);
router.patch("/:id/status", updateTransactionStatus);

export default router;