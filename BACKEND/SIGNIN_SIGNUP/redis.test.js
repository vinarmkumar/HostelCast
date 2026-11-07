const test = require("node:test");
const assert = require("node:assert/strict");
const { incrementRateLimit } = require("./redis");

function createFakeRedis(initialValue, initialTtl) {
  let value = initialValue;
  let ttl = initialTtl;

  return {
    async incr() {
      value = String(Number(value || 0) + 1);
      return Number(value);
    },
    async ttl() {
      return ttl;
    },
    async set(_key, newValue, options) {
      value = newValue;
      ttl = options.EX;
    },
  };
}

test("resets a stale rate-limit key with no expiry and allows a fresh request", async () => {
  const redis = createFakeRedis("8", -1);

  assert.deepEqual(await incrementRateLimit(redis, "otp:signup:test", 60), { count: 1, ttl: 60 });
  assert.deepEqual(await incrementRateLimit(redis, "otp:signup:test", 60), { count: 2, ttl: 60 });
});

test("starts the expiry for a new rate-limit key", async () => {
  const redis = createFakeRedis(null, -2);

  assert.deepEqual(await incrementRateLimit(redis, "otp:signup:test", 60), { count: 1, ttl: 60 });
});
