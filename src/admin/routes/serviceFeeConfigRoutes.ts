import { Router } from "express";
import {
  listFeeConfigs,
  upsertFeeConfig,
  toggleFeeConfig,
  deleteFeeConfig,
} from "../controller/serviceFeeConfigController.js";

const router = Router();

router.get("/", listFeeConfigs);
router.put("/:category", upsertFeeConfig);
router.patch("/:category/toggle", toggleFeeConfig);
router.delete("/:category", deleteFeeConfig);

export default router;
