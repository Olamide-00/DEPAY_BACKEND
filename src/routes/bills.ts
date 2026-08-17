import express from "express";
import { getBillsHistories, getServicesController, getServiceVariationsController, payBillController } from "../controller/version2/bills/serviceController.js";
import { transactionLimiter } from "../utils/version2/rateLimiter.js";

const router = express.Router();

router.get("/get-services", getServicesController);
router.post("/pay-bill", transactionLimiter, payBillController);
router.get("/get-packages", getServiceVariationsController);
router.get("/get-bills-history/:email", getBillsHistories);

export default router;
