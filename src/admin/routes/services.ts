import express from "express";
import {
  getServices,
  toggleService,
  updateDiscount,
} from "../controller/services.js";

const router = express.Router();

router.get("/", getServices);
router.patch("/:id/toggle", toggleService);
router.patch("/:id/discount", updateDiscount);

export default router;
