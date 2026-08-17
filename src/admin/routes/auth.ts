import express from "express";
import {
  adminLogin,
  adminSignup,
  forgotPassword,
  resetPassword,
} from "../controller/adminAuth.js";

const router = express.Router();

router.post("/login", adminLogin);
router.post("/signup", adminSignup);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

export default router;