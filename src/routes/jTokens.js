import { convertJTokens } from "../controller/version2/jtokens/jTokens.js";
import { Router } from "express";

const router = Router();

router.post("/convert-jtokens", convertJTokens);

export default router;
