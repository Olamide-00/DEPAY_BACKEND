import express from "express";
import {
  getDashboardStats,
  getDashboardChart,
  getSalesBreakdown,
  getRecentTransactions,
  getEarnings,
} from "../controller/dashboard.js";

const router = express.Router();

router.get("/stats", getDashboardStats);
router.get("/chart", getDashboardChart);
router.get("/sales-breakdown", getSalesBreakdown);
router.get("/recent-transactions", getRecentTransactions);
router.get("/earnings", getEarnings);

export default router;
