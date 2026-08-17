import express from "express";
import {
  setPIN,
  updatePIN,
  verifyPIN,
} from "../controller/version2/pinController/pinController.js";

const router = express.Router();

router.post("/set-PIN", setPIN);
router.post("/verify-PIN", verifyPIN);
router.post("/update-pin", updatePIN);

export default router;
