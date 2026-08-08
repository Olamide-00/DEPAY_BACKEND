import express from "express";
import { getFundings, getFundingStats } from "../controller/fundings.js";

const router = express.Router();

router.get("/stats", getFundingStats);
router.get("/", getFundings);

export default router;