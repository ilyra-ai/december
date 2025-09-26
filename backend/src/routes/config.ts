import express from "express";
import {
  getAiConfig,
  getSupportedProviders,
  updateAiConfig,
} from "../services/ai-config";

const router = express.Router();

router.get("/ai", async (_req, res) => {
  try {
    const config = await getAiConfig();
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

router.put("/ai", async (req, res) => {
  try {
    const updated = await updateAiConfig(req.body || {});
    res.json({ success: true, config: updated });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Invalid configuration",
    });
  }
});

router.get("/ai/providers", (_req, res) => {
  res.json({ success: true, providers: getSupportedProviders() });
});

export default router;
