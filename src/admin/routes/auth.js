import express from "express";
import { adminLogin, adminSignup } from "../controller/adminAuth.js";

const router = express.Router();

router.post("/login", adminLogin);
router.post("/signup", adminSignup);

export default router;
