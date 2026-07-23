import express from "express";
import { handleWebhook } from "../webhook/version2/funds.js";


const router = express.Router();

router.post("/webhook", handleWebhook);

export default router;
