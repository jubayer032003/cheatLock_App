import express from "express";
import mongoose from "mongoose";
import { validateStartupConfig } from "../config.js";

export function createHealthRouter({
  connection = mongoose.connection,
  validateConfig = validateStartupConfig,
} = {}) {
  const router = express.Router();

  router.get("/", (_req, res) => readinessResponse(res, connection, validateConfig));

  router.get("/live", (_req, res) => {
    res.json({
      ok: true,
      status: "live",
      service: "cheatlock-backend",
      timestamp: new Date().toISOString(),
    });
  });

  router.get("/ready", (_req, res) => readinessResponse(res, connection, validateConfig));

  return router;
}

export const healthRouter = createHealthRouter();

function readinessResponse(res, connection, validateConfig) {
  const checks = {
    config: "ok",
    mongodb: connection.readyState === 1 ? "ok" : "unavailable",
  };

  try {
    validateConfig();
  } catch {
    checks.config = "invalid";
  }

  const ready = checks.config === "ok" && checks.mongodb === "ok";
  res.status(ready ? 200 : 503).json({
    ok: ready,
    status: ready ? "ready" : "not_ready",
    service: "cheatlock-backend",
    checks,
    timestamp: new Date().toISOString(),
  });
}
