import express from "express";
import { getUserFundingHistory } from "../controller/fundingHistory.js";

const router = express.Router();
router.get("/funding-history/:email", getUserFundingHistory);

export default router;
