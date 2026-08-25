import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
if (process.env.CHEATLOCK_SKIP_DOTENV !== "true") {
  dotenv.config({ path: resolve(__dirname, "../.env"), override: false });
}

const REQUIRED_STARTUP_VARIABLES = ["MONGODB_URI", "JWT_SECRET"];
const REQUIRED_S3_VARIABLES = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"];
const REQUIRED_SUPABASE_VARIABLES = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
const DEVELOPMENT_CORS_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5175",
  "http://127.0.0.1:5175",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:4175",
  "http://127.0.0.1:4175",
];

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

function resolveSupabaseConfig() {
  const present = REQUIRED_SUPABASE_VARIABLES.filter((name) => Boolean(process.env[name]?.trim()));
  if (present.length === 0) {
    return { enabled: false };
  }

  const missing = REQUIRED_SUPABASE_VARIABLES.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Incomplete Supabase configuration. Missing: ${missing.join(", ")}`);
  }

  return {
    enabled: true,
    url: readRequired("SUPABASE_URL"),
    serviceRoleKey: readRequired("SUPABASE_SERVICE_ROLE_KEY"),
  };
}

export function validateStartupConfig() {
  for (const name of REQUIRED_STARTUP_VARIABLES) {
    readRequired(name);
  }
  resolveS3Config();
  resolveAllowedOrigins({
    nodeEnv: readOptional("NODE_ENV", "development"),
    clientOrigin: readOptional("CLIENT_ORIGIN"),
    allowedOrigins: readOptional("ALLOWED_ORIGINS"),
  });
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
    expiresIn: readOptional("JWT_EXPIRES_IN", readOptional("NODE_ENV", "development") === "production" ? "1h" : "7d"),
  },
  redis: {
    url: readOptional("REDIS_URL", "redis://127.0.0.1:6379"),
  },
  cors: {
    clientOrigin: readOptional("CLIENT_ORIGIN"),
    allowedOrigins: readOptional("ALLOWED_ORIGINS"),
  },
  auth: {
    resetTokenExpiresMinutes: Number(readOptional("RESET_TOKEN_EXPIRES_MINUTES", "30")),
  },
  s3: resolveS3Config,
  supabase: resolveSupabaseConfig,
};

export function resolveAllowedOrigins({
  nodeEnv = "development",
  clientOrigin = "",
  allowedOrigins = "",
} = {}) {
  const isProduction = nodeEnv === "production";
  const rawEntries = [
    clientOrigin,
    ...String(allowedOrigins || "").split(","),
  ];
  const configured = [];
  for (const rawEntry of rawEntries) {
    const entry = String(rawEntry || "").trim();
    if (!entry) {
      if (isProduction && String(allowedOrigins || "").includes(",")) {
        throw new Error("Invalid CORS origin entry in production.");
      }
      continue;
    }
    if (entry === "*") {
      throw new Error("Wildcard CORS origins are not allowed in production.");
    }
    configured.push(normalizeOrigin(entry));
  }

  const origins = [...new Set(isProduction ? configured : [...configured, ...DEVELOPMENT_CORS_ORIGINS])];
  if (isProduction && origins.length === 0) {
    throw new Error("Production CORS requires ALLOWED_ORIGINS or CLIENT_ORIGIN.");
  }
  return origins;
}

export function buildCorsOptions() {
  const allowedOrigins = resolveAllowedOrigins({
    nodeEnv: config.nodeEnv,
    clientOrigin: config.cors.clientOrigin,
    allowedOrigins: config.cors.allowedOrigins,
  });
  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }
      try {
        const normalized = normalizeOrigin(origin);
        callback(null, allowedOrigins.includes(normalized));
      } catch {
        callback(null, false);
      }
    },
    credentials: false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
  };
}

function normalizeOrigin(origin) {
  try {
    const parsed = new URL(origin);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Invalid CORS origin protocol.");
    }
    return parsed.origin;
  } catch {
    throw new Error("Invalid CORS origin entry.");
  }
}
