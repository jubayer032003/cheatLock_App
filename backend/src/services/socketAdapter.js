import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import { config } from "../config.js";
import { logger } from "./logger.js";

export async function configureSocketAdapter(io) {
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
    logger.warn("Socket.IO Redis adapter unavailable; development server is limited to one backend instance.");
    return async () => {};
  }

  return async () => {
    await Promise.allSettled([publisher.quit(), subscriber.quit()]);
  };
}
