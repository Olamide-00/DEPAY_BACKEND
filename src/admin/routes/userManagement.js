import express from "express";
import {
  getUserStats,
  getUserChart,
  getSignupSources,
  getUsers,
  getUserById,
  toggleBanUser,
  createUser,
  exportUsers,
  deleteUser,
} from "../controller/userManagement.js";
import { fundUserWallet } from "../controller/wallet.js";

const router = express.Router();

router.get("/stats", getUserStats);
router.get("/chart", getUserChart);
router.get("/signup-sources", getSignupSources);
router.get("/export", exportUsers);
router.get("/", getUsers);
router.get("/:id", getUserById);
router.post("/", createUser);
router.patch("/:id/ban", toggleBanUser);
router.post("/:id/fund", fundUserWallet);
router.delete("/:id", deleteUser);

export default router;