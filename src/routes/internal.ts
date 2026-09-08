import express from "express";
import { queueWorker } from "../service/version2/queueWorker.js";

//interna service

const router = express.Router();

router.get("/process-queue", async (req, res) => {
  const providedSecret =
    req.headers.authorization?.replace("Bearer ", "") ||
    req.headers["x-cron-secret"];

  if (!process.env.CRON_SECRET) {
    console.error("[process-queue] CRON_SECRET is not set — refusing to run.");
    return res
      .status(500)
      .json({ error: "Server not configured for manual trigger access" });
  }

  if (providedSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = await queueWorker.processJobQueue();
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[process-queue] Error:", message);
    return res.status(500).json({ success: false, error: message });
  }
});

export default router;
