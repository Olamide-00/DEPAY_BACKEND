import express from "express";
import { verifySmartcardController } from "../controller/bills/verificationController.js";

const router = express.Router();

// POST endpoint to verify smartcard number
router.post("/verify", verifySmartcardController);

export default router;
