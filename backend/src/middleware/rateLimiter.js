import Redis from "ioredis";
import { config } from "../config.js";
import { logger } from "../services/logger.js";

const DEFAULT_LIMITS = {
  api: { windowMs: 60 * 1000, max: 120 },
  login: { windowMs: 15 * 60 * 1000, max: 8 },
  signup: { windowMs: 60 * 60 * 1000, max: 10 },
  passwordReset: { windowMs: 15 * 60 * 1000, max: 5 },
  accessCode: { windowMs: 10 * 60 * 1000, max: 20 },
  socketAuth: { windowMs: 5 * 60 * 1000, max: 30 },
};

const redisUrl = config.redis.url;
let redisConnected = false;

// Initialize Redis client with reconnection limits
const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  retryStrategy: () => null,
});

redis.connect()
  .then(() => {
    redisConnected = true;
    logger.info("Rate limiter connected to Redis.");
  })
  .catch((err) => {
    redisConnected = false;
    logger.warn(`Rate limiter Redis connection failed: ${err.message}. Falling back to memory limiter.`);
  });

redis.on("error", (err) => {
  if (redisConnected) {
    logger.error(`Redis connection lost: ${err.message}. Switching to memory limiter fallback.`);
    redisConnected = false;
  }
});

redis.on("ready", () => {
  if (!redisConnected) {
    logger.info("Redis server reconnected. Restoring Redis rate limiting.");
    redisConnected = true;
  }
});

const memoryHistory = new Map();

export const rateLimiter = createRateLimiter("api", DEFAULT_LIMITS.api);
export const loginRateLimiter = createRateLimiter("login", DEFAULT_LIMITS.login, accountAwareKey);
export const signupRateLimiter = createRateLimiter("signup", DEFAULT_LIMITS.signup, accountAwareKey);
export const passwordResetRateLimiter = createRateLimiter("password-reset", DEFAULT_LIMITS.passwordReset, accountAwareKey);
export const accessCodeRateLimiter = createRateLimiter("access-code", DEFAULT_LIMITS.accessCode, accessCodeAwareKey);

export function createRateLimiter(group, policy, keyBuilder = ipOnlyKey) {
  return async function groupedRateLimiter(req, res, next) {
    const key = `${group}:${keyBuilder(req)}`;
    const result = await consumeRateLimit(key, policy);
    if (!result.allowed) {
      res.setHeader("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
      res.status(429).json({
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
        retryAfterMs: result.retryAfterMs,
      });
      return;
    }

    next();
  };
}

export async function consumeSocketAuthRateLimit(ip = "unknown") {
  return consumeRateLimit(`socket-auth:${normalizeKeyPart(ip)}`, DEFAULT_LIMITS.socketAuth);
}

export function clearRateLimiterStateForTests() {
  memoryHistory.clear();
}

async function consumeRateLimit(key, policy) {
  const now = Date.now();

  if (redisConnected) {
    try {
      const redisKey = `ratelimit:${key}`;
      const clearBefore = now - policy.windowMs;

      const multi = redis.multi();
      multi.zremrangebyscore(redisKey, 0, clearBefore);
      multi.zadd(redisKey, now, `${now}-${Math.random()}`);
      multi.zcard(redisKey);
      multi.pexpire(redisKey, policy.windowMs);

      const results = await multi.exec();
      const requestCount = results[2][1];
      if (requestCount > policy.max) {
        return { allowed: false, retryAfterMs: policy.windowMs };
      }
      return { allowed: true, retryAfterMs: 0 };
    } catch (err) {
      logger.error(`Redis rate limiting operation failed: ${err.message}. Invoking memory fallback.`);
    }
  }

  const timestamps = memoryHistory.get(key) || [];
  const validTimestamps = timestamps.filter((time) => now - time < policy.windowMs);
  if (validTimestamps.length >= policy.max) {
    const retryAfterMs = policy.windowMs - (now - validTimestamps[0]);
    memoryHistory.set(key, validTimestamps);
    return { allowed: false, retryAfterMs };
  }

  memoryHistory.set(key, [...validTimestamps, now]);
  return { allowed: true, retryAfterMs: 0 };
}

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  const longestWindowMs = Math.max(...Object.values(DEFAULT_LIMITS).map((policy) => policy.windowMs));
  for (const [key, timestamps] of memoryHistory.entries()) {
    const valid = timestamps.filter((time) => now - time < longestWindowMs);
    if (valid.length === 0) {
      memoryHistory.delete(key);
    } else {
      memoryHistory.set(key, valid);
    }
  }
}, 10 * 60 * 1000);
cleanupTimer.unref?.();

function accountAwareKey(req) {
  const identifier = normalizeIdentifier(req.body?.identifier || req.body?.email || req.params?.userId || "");
  return `${ipOnlyKey(req)}:${identifier || "no-account"}`;
}

function accessCodeAwareKey(req) {
  return `${ipOnlyKey(req)}:${normalizeKeyPart(req.params?.code || req.body?.code || "no-code")}`;
}

function ipOnlyKey(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return normalizeKeyPart(forwarded || req.ip || "unknown");
}

function normalizeIdentifier(value) {
  return normalizeKeyPart(String(value || "").trim().toLowerCase().replace(/\s+/g, ""));
}

function normalizeKeyPart(value) {
  return String(value || "unknown").trim().toLowerCase().replace(/[^a-z0-9_.:@-]/g, "_").slice(0, 160);
}
