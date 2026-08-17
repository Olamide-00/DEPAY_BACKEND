import { convertJTokens } from "../controller/version2/jtokens/jTokens.js";
import { Router } from "express";
import { transactionLimiter } from "../utils/version2/rateLimiter.js";

const router = Router();

router.post("/convert-jtokens", transactionLimiter, convertJTokens);

export default router;
