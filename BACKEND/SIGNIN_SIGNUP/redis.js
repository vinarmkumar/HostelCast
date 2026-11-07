const { createClient } = require("redis");

let redisClient = null;
let lastConnectionAttemptAt = 0;
const reconnectDelayMs = 10_000;

// Redis ko lazy connect rakha gaya hai, taaki Redis unavailable ho to backend MongoDB se chal sake.
async function getRedisClient() {
  if (!process.env.REDIS_URL) return null;
  if (redisClient) return redisClient.isReady ? redisClient : null;
  if (Date.now() - lastConnectionAttemptAt < reconnectDelayMs) return null;

  lastConnectionAttemptAt = Date.now();
  redisClient = createClient({ url: process.env.REDIS_URL });
  redisClient.on("error", (error) => console.error("Redis connection error:", error.message));

  try {
    await redisClient.connect();
    console.log("Redis connected successfully.");
    return redisClient;
  } catch (error) {
    console.error("Redis unavailable; MongoDB fallback active:", error.message);
    redisClient = null;
    return null;
  }
}

async function getCachedValue(key) {
  const client = await getRedisClient();
  if (!client) return null;
  try {
    return await client.get(key);
  } catch (error) {
    console.error("Redis cache read failed:", error.message);
    return null;
  }
}

async function setCachedValue(key, value, ttlSeconds = 60) {
  const client = await getRedisClient();
  if (!client) return false;
  try {
    await client.set(key, value, { EX: ttlSeconds });
    return true;
  } catch (error) {
    console.error("Redis cache write failed:", error.message);
    return false;
  }
}

async function deleteCachedValue(key) {
  const client = await getRedisClient();
  if (!client) return false;
  try {
    await client.del(key);
    return true;
  } catch (error) {
    console.error("Redis cache delete failed:", error.message);
    return false;
  }
}

async function setRateLimit(key, windowSeconds) {
  const client = await getRedisClient();
  if (!client) return null;
  try {
    const count = await client.incr(key);
    if (count === 1) await client.expire(key, windowSeconds);
    return { count, ttl: await client.ttl(key) };
  } catch (error) {
    console.error("Redis rate limit failed:", error.message);
    return null;
  }
}

async function closeRedis() {
  if (redisClient?.isOpen) await redisClient.quit();
}

module.exports = {
  getRedisClient,
  getCachedValue,
  setCachedValue,
  deleteCachedValue,
  setRateLimit,
  closeRedis,
};
