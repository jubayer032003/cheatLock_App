import cors from "cors";
import express from "express";
import helmet from "helmet";
import http from "node:http";
import mongoose from "mongoose";
import dns from "node:dns";
import { config, validateStartupConfig } from "./config.js";
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
import { questionBankRouter } from "./routes/questionBank.js";
import { selfExamRouter } from "./routes/selfExam.js";
import { Server } from "socket.io";
import { configureProctoringSocket } from "./socket/proctoring.js";
import { rateLimiter } from "./middleware/rateLimiter.js";
import { logger } from "./services/logger.js";

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
const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
];
const configuredAllowedOrigins = [
  config.cors.clientOrigin,
  ...config.cors.allowedOrigins.split(","),
]
  .map((origin) => origin?.trim())
  .filter(Boolean);
const allowedOrigins = Array.from(new Set([...configuredAllowedOrigins, ...defaultAllowedOrigins]));
const corsOrigin = allowedOrigins.includes("*") ? true : allowedOrigins;

app.use(
  cors({
    origin: corsOrigin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
  })
);
app.options(
  "*",
  cors({
    origin: corsOrigin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
  })
);
app.use(helmet());
app.use(rateLimiter);
app.use(express.json({ limit: "3mb" }));

app.get("/health", (_req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? "CONNECTED" : "DISCONNECTED";
  res.json({
    ok: true,
    service: "cheatlock-backend",
    database: dbStatus,
    timestamp: new Date().toISOString(),
  });
});

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

const io = new Server(server, {
  cors: {
    origin: corsOrigin,
  },
});
app.set("io", io);
configureProctoringSocket(io);

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({
    message: err.message || "Server error",
  });
});

try {
  logger.info(`MongoDB connection type: ${config.mongodb.uri().startsWith("mongodb+srv://") ? "mongodb+srv" : "mongodb"}`);
  await mongoose.connect(config.mongodb.uri(), {
    serverSelectionTimeoutMS: 10000,
    dbName: config.mongodb.dbName,
  });

  logger.info(`MongoDB connected successfully. Database: ${mongoose.connection.name}`);

  server.listen(port, "0.0.0.0", () => {
    logger.info(`CheatLock backend running on http://localhost:${port}`);
  });
} catch (error) {
  logger.critical(`Failed to connect to MongoDB: ${error.name || "ConnectionError"}`);
  process.exit(1);
}
