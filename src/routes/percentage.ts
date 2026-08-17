import express from "express";
import { percentage } from "../controller/percentage.js";

const router = express.Router();

router.get("/", percentage);

export default router;
