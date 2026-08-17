import express from "express";
import { queueWorker } from "../service/version2/queueWorker.js";

// ══════════════════════════════════════════════════════════════════
// Manual "process a batch of the queue right now" trigger.
//
// Not required for normal operation — on Render, `queueWorker.start()`
// (see app.js) already runs continuously in-process, polling and
// processing the job queue on its own schedule. This endpoint exists
// purely as an ops/debugging convenience: e.g. if you want to force a
// batch through immediately after investigating a stuck job, without
// waiting for the next poll interval.
//
// (If you ever move to a serverless host again — Vercel, Lambda,
// etc. — this endpoint becomes load-bearing instead of optional: a
// setInterval loop can't run reliably there, so you'd point a
// scheduled trigger, e.g. Vercel Cron, at this route instead. Not a
// concern on Render.)
//
// Protected by a shared secret (CRON_SECRET env var) since it's not
// a user or admin action.
// ══════════════════════════════════════════════════════════════════

const router = express.Router();

router.get("/process-queue", async (req, res) => {
  const providedSecret =
    req.headers.authorization?.replace("Bearer ", "") || req.headers["x-cron-secret"];

  if (!process.env.CRON_SECRET) {
    console.error("[process-queue] CRON_SECRET is not set — refusing to run.");
    return res.status(500).json({ error: "Server not configured for manual trigger access" });
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
