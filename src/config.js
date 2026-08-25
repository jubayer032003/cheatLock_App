import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
if (process.env.CHEATLOCK_SKIP_DOTENV !== "true") {
  dotenv.config({ path: resolve(__dirname, "../.env"), override: false });
}

const REQUIRED_STARTUP_VARIABLES = ["MONGODB_URI", "JWT_SECRET"];
const REQUIRED_S3_VARIABLES = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"];

function readRequired(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readOptional(name, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

function resolveS3Config() {
  const present = REQUIRED_S3_VARIABLES.filter((name) => Boolean(process.env[name]?.trim()));
  if (present.length === 0) {
    return { enabled: false };
  }

  const missing = REQUIRED_S3_VARIABLES.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Incomplete S3 configuration. Missing: ${missing.join(", ")}`);
  }

  return {
    enabled: true,
    endpoint: readRequired("S3_ENDPOINT"),
    bucket: readRequired("S3_BUCKET"),
    accessKey: readRequired("S3_ACCESS_KEY"),
    secretKey: readRequired("S3_SECRET_KEY"),
    region: readOptional("S3_REGION", "us-east-1"),
  };
}

export function validateStartupConfig() {
  for (const name of REQUIRED_STARTUP_VARIABLES) {
    readRequired(name);
  }
  resolveS3Config();
}

export const config = {
  nodeEnv: readOptional("NODE_ENV", "development"),
  port: Number(readOptional("PORT", "3000")),
  mongodb: {
    uri: () => readRequired("MONGODB_URI"),
    dbName: readOptional("MONGODB_DB_NAME", "cheatlock"),
  },
  jwt: {
    secret: () => readRequired("JWT_SECRET"),
    expiresIn: readOptional("JWT_EXPIRES_IN", "7d"),
  },
  redis: {
    url: readOptional("REDIS_URL", "redis://127.0.0.1:6379"),
  },
  cors: {
    clientOrigin: readOptional("CLIENT_ORIGIN"),
    allowedOrigins: readOptional("ALLOWED_ORIGINS", "*"),
  },
  s3: resolveS3Config,
};
