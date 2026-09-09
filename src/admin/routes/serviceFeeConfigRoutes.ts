// routes/admin/serviceFeeConfigRoutes.ts
import { Router } from "express";
import {
  listFeeConfigs,
  upsertFeeConfig,
  toggleFeeConfig,
  deleteFeeConfig,
} from "../controller/serviceFeeConfigController.js";

const router = Router();

router.get("/", listFeeConfigs);
router.put("/:serviceID", upsertFeeConfig);
router.patch("/:serviceID/toggle", toggleFeeConfig);
router.delete("/:serviceID", deleteFeeConfig);

export default router;
