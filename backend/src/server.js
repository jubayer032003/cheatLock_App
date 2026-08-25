import cors from "cors";
import express from "express";
import helmet from "helmet";
import http from "node:http";
import mongoose from "mongoose";
import dns from "node:dns";
import { buildCorsOptions, config, validateStartupConfig } from "./config.js";
import { authRouter } from "./routes/auth.js";
import { classesRouter } from "./routes/classes.js";
import { communityRouter } from "./routes/community.js";
import { examsRouter } from "./routes/exams.js";
import { proctoringRouter } from "./routes/proctoring.js";
import { sessionsRouter } from "./routes/sessions.js";
import { submissionsRouter } from "./routes/submissions.js";
import { teacherRouter } from "./routes/teacher.js";
import { studentsRouter } from "./routes/students.js";
import { tenantsRouter } from "./routes/tenants.js";
import { scimRouter } from "./routes/scim.js";
import { ltiRouter } from "./routes/lti.js";
import { publicApiRouter } from "./routes/publicApi.js";
import { healthRouter } from "./routes/health.js";
import { questionBankRouter } from "./routes/questionBank.js";
import { selfExamRouter } from "./routes/selfExam.js";
import { Server } from "socket.io";
import { configureProctoringSocket } from "./socket/proctoring.js";
import { rateLimiter } from "./middleware/rateLimiter.js";
import { logger } from "./services/logger.js";
import { configureEvidenceRetentionCleanup } from "./services/evidenceRetention.js";
import { configureSocketAdapter } from "./services/socketAdapter.js";

validateStartupConfig();

if (process.env.MONGODB_DNS_SERVERS) {
  dns.setServers(
    process.env.MONGODB_DNS_SERVERS.split(",")
      .map((server) => server.trim())
      .filter(Boolean)
  );
}

const app = express();
const server = http.createServer(app);
const port = config.port;
const corsOptions = buildCorsOptions();

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(helmet());
app.use((req, res, next) => {
  const requestId = req.get("x-request-id") || cryptoRandomId();
  req.id = requestId;
  res.setHeader("x-request-id", requestId);
  next();
});
app.use("/health", healthRouter);
app.use(rateLimiter);
app.use(express.json({ limit: "3mb" }));

app.use("/auth", authRouter);
app.use("/classes", classesRouter);
app.use("/community", communityRouter);
app.use("/exams", examsRouter);
app.use("/proctoring", proctoringRouter);
app.use("/sessions", sessionsRouter);
app.use("/submissions", submissionsRouter);
app.use("/teacher", teacherRouter);
app.use("/students", studentsRouter);
app.use("/tenants", tenantsRouter);
app.use("/scim", scimRouter);
app.use("/lti", ltiRouter);
app.use("/public", publicApiRouter);
app.use("/question-bank", questionBankRouter);
app.use("/self-exam", selfExamRouter);
app.use("/self-exams", selfExamRouter);
app.use("/seft-exam", selfExamRouter);

app.use((req, res) => {
  res.status(404).json({
    code: "ROUTE_NOT_FOUND",
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

const io = new Server(server, {
  cors: {
    origin: corsOptions.origin,
    credentials: false,
  },
});
let closeSocketAdapter = async () => {};
app.set("io", io);
configureProctoringSocket(io);

app.use((err, req, res, _next) => {
  const status = err.status || 500;
  logger.error("Request failed.", {
    statusCode: status,
    requestId: req.id,
    method: req.method,
    path: req.path,
    code: err.code || "REQUEST_FAILED",
  });
  res.status(status).json({
    code: err.code || (status === 500 ? "SERVER_ERROR" : "REQUEST_FAILED"),
    message: config.nodeEnv === "production" && status >= 500
      ? "Server error"
      : err.message || "Server error",
  });
});

try {
  logger.info("Backend startup configuration accepted.", {
    nodeEnv: config.nodeEnv,
    port,
    corsConfigured: Boolean(config.cors.clientOrigin || config.cors.allowedOrigins),
    s3Enabled: config.s3().enabled,
    redisConfigured: Boolean(config.redis.url),
  });
  logger.info(`MongoDB connection type: ${config.mongodb.uri().startsWith("mongodb+srv://") ? "mongodb+srv" : "mongodb"}`);
  await mongoose.connect(config.mongodb.uri(), {
    serverSelectionTimeoutMS: 10000,
    dbName: config.mongodb.dbName,
  });

  logger.info(`MongoDB connected successfully. Database: ${mongoose.connection.name}`);
  closeSocketAdapter = await configureSocketAdapter(io);
  await configureEvidenceRetentionCleanup();

  server.on("error", (error) => {
    logger.critical("Backend HTTP server failed.", {
      errorName: error.name,
      errorCode: error.code,
      message: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });

  server.listen(port, "0.0.0.0", () => {
    logger.info(`CheatLock backend running on http://localhost:${port}`);
  });
} catch (error) {
  logger.critical("Backend startup failed.", {
    errorName: error.name || "StartupError",
    errorCode: error.code,
    message: error.message,
    stack: error.stack,
  });
  process.exit(1);
}

function cryptoRandomId() {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

async function shutdown(signal) {
  logger.info("Backend shutdown requested.", { signal });
  server.close(async () => {
    await closeSocketAdapter().catch((error) => {
      logger.error("Socket.IO Redis adapter shutdown failed.", { errorName: error.name });
    });
    await mongoose.disconnect().catch((error) => {
      logger.error("MongoDB disconnect failed during shutdown.", { errorName: error.name });
    });
    logger.info("Backend shutdown complete.", { signal });
    process.exit(0);
  });
  setTimeout(() => {
    logger.critical("Backend shutdown timed out.", { signal });
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (error) => {
  logger.critical("Uncaught exception.", {
    errorName: error.name,
    errorCode: error.code,
    message: error.message,
    stack: error.stack,
  });
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  logger.critical("Unhandled promise rejection.", {
    reasonName: reason?.name || typeof reason,
    reasonCode: reason?.code,
    message: reason?.message,
    stack: reason?.stack,
  });
  process.exit(1);
});
