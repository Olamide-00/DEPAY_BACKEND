import express from "express";
import { getBillsHistories, getServicesController, getServiceVariationsController, payBillController } from "../controller/version2/bills/serviceController.js";

const router = express.Router();

router.get("/get-services", getServicesController);
router.post("/pay-bill", payBillController);
router.get("/get-packages", getServiceVariationsController);
router.get("/get-bills-history/:email", getBillsHistories);

export default router;
