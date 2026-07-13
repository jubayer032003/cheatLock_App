import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import http from "node:http";
import mongoose from "mongoose";
import dns from "node:dns";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
import { Server } from "socket.io";
import { configureProctoringSocket } from "./socket/proctoring.js";
import { rateLimiter } from "./middleware/rateLimiter.js";
import { logger } from "./services/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env"), override: false });

if (process.env.MONGODB_DNS_SERVERS) {
  dns.setServers(
    process.env.MONGODB_DNS_SERVERS.split(",")
      .map((server) => server.trim())
      .filter(Boolean)
  );
}

const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT || 3000);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((origin) => origin.trim());

app.use(
  cors({
    origin: allowedOrigins.includes("*") ? true : allowedOrigins,
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

const io = new Server(server, {
  cors: {
    origin: allowedOrigins.includes("*") ? true : allowedOrigins,
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

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is missing. Add it to backend/.env.");
}

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is missing. Add it to backend/.env.");
}

const mongoUriDisplay = process.env.MONGODB_URI.replace(
  /\/\/([^:]+):([^@]+)@/,
  "//$1:*****@"
);
console.log(`MongoDB connection type: ${process.env.MONGODB_URI.startsWith("mongodb+srv://") ? "mongodb+srv" : "mongodb://"}, URI: ${mongoUriDisplay}`);

try {
await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    dbName: process.env.MONGODB_DB_NAME || "cheatlock",
  });

  logger.info(`MongoDB connected successfully. Database: ${mongoose.connection.name}`);

  server.listen(port, "0.0.0.0", () => {
    logger.info(`CheatLock backend running on http://localhost:${port}`);
  });
} catch (error) {
  logger.critical(`Failed to connect to MongoDB: ${error.message}`);
  process.exit(1);
}
