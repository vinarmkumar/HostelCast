const { setRateLimit, deleteCachedValue } = require("../redis");

async function checkOtpCooldown(email) {
  const result = await setRateLimit(`otp:signup:${email}`, 60);
  if (!result || result.count <= 1) return { allowed: true };
  return { allowed: false, retryAfterSeconds: Math.max(result.ttl, 1) };
}

async function clearOtpCooldown(email) {
  await deleteCachedValue(`otp:signup:${email}`);
}

module.exports = { checkOtpCooldown, clearOtpCooldown };
