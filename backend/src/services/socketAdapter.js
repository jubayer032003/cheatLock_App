import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { config } from "../config.js";
import { logger } from "./logger.js";

export async function configureSocketAdapter(io) {
  if (!config.redis.url) {
    logger.warn("REDIS_URL is not configured. Socket.IO is using the in-memory adapter for this single-instance deploy.");
    return async () => {};
  }

  const options = {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy: () => null,
  };
  const publisher = new Redis(config.redis.url, options);
  const subscriber = publisher.duplicate();
  // ioredis emits `error` independently of connect() rejection. Register handlers
  // before connecting so an unavailable development Redis cannot crash the process.
  publisher.on("error", () => {});
  subscriber.on("error", () => {});

  try {
    await Promise.all([publisher.connect(), subscriber.connect()]);
    io.adapter(createAdapter(publisher, subscriber));
    logger.info("Socket.IO Redis adapter connected.");
  } catch (error) {
    publisher.disconnect();
    subscriber.disconnect();
    if (config.nodeEnv === "production") {
      const startupError = new Error("Socket.IO Redis adapter is required in production.");
      startupError.cause = error;
      throw startupError;
    }
    logger.warn("Socket.IO Redis adapter unavailable; server is using the in-memory adapter for this instance.", {
      errorName: error?.name,
      message: error?.message,
    });
    return async () => {};
  }

  return async () => {
    await Promise.allSettled([publisher.quit(), subscriber.quit()]);
  };
}
