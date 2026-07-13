import Redis from "ioredis";
import { logger } from "../services/logger.js";

const LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 120; // 120 requests/minute limit

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
let redisConnected = false;

// Initialize Redis client with reconnection limits
const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.connect()
  .then(() => {
    redisConnected = true;
    logger.info(`Rate limiter connected to Redis at: ${redisUrl}`);
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

// Memory-based fallback rate limiter history map
const ipHistory = new Map();

export async function rateLimiter(req, res, next) {
  const ip = req.headers["x-forwarded-for"] || req.ip || "unknown";
  const now = Date.now();

  if (redisConnected) {
    try {
      const key = `ratelimit:${ip}`;
      const clearBefore = now - LIMIT_WINDOW_MS;

      // Redis Sorted Set sliding-window transaction
      const multi = redis.multi();
      multi.zremrangebyscore(key, 0, clearBefore);
      multi.zadd(key, now, `${now}-${Math.random()}`);
      multi.zcard(key);
      multi.pexpire(key, LIMIT_WINDOW_MS);

      const results = await multi.exec();
      const requestCount = results[2][1]; // Number of requests in the window

      if (requestCount > MAX_REQUESTS_PER_WINDOW) {
        res.status(429).json({
          message: "Too many requests. Please try again after a minute.",
          retryAfterMs: LIMIT_WINDOW_MS,
        });
        return;
      }
      next();
      return;
    } catch (err) {
      logger.error(`Redis rate limiting operation failed: ${err.message}. Invoking memory fallback.`);
    }
  }

  // Memory Limiter Fallback Logic
  if (!ipHistory.has(ip)) {
    ipHistory.set(ip, [now]);
    next();
    return;
  }

  const timestamps = ipHistory.get(ip);
  const validTimestamps = timestamps.filter((time) => now - time < LIMIT_WINDOW_MS);
  
  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    res.status(429).json({
      message: "Too many requests. Please try again after a minute.",
      retryAfterMs: LIMIT_WINDOW_MS - (now - validTimestamps[0]),
    });
    return;
  }

  validTimestamps.push(now);
  ipHistory.set(ip, validTimestamps);
  next();
}

// Clean up stale memory-limiter entries periodically (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, timestamps] of ipHistory.entries()) {
    const valid = timestamps.filter((time) => now - time < LIMIT_WINDOW_MS);
    if (valid.length === 0) {
      ipHistory.delete(ip);
    } else {
      ipHistory.set(ip, valid);
    }
  }
}, 10 * 60 * 1000);

