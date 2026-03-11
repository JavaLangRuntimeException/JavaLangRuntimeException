import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { _redis?: Redis };

export function getRedis(): Redis {
  if (!globalForRedis._redis) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error("REDIS_URL is not set");
    }
    globalForRedis._redis = new Redis(url);
  }
  return globalForRedis._redis;
}
