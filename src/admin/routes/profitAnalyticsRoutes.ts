// routes/admin/profitAnalyticsRoutes.ts
import { Router } from "express";
import {
  getProfitSummary,
  getProfitTimeseries,
} from "../controller/profitAnalyticsController.js";

const router = Router();

router.get("/", getProfitSummary);
router.get("/timeseries", getProfitTimeseries);

export default router;
