const test = require("node:test");
const assert = require("node:assert/strict");
const { corsOrigin, isAllowedOrigin, validateFrontendOrigins } = require("./corsConfig");

const originalNodeEnv = process.env.NODE_ENV;
const originalFrontendOrigins = process.env.FRONTEND_ORIGINS;

test.afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalFrontendOrigins === undefined) delete process.env.FRONTEND_ORIGINS;
  else process.env.FRONTEND_ORIGINS = originalFrontendOrigins;
});

test("allows local development origins and requests without an Origin header", () => {
  delete process.env.FRONTEND_ORIGINS;
  process.env.NODE_ENV = "development";

  assert.equal(isAllowedOrigin("http://localhost:5173"), true);
  assert.equal(isAllowedOrigin("http://127.0.0.1:5173"), true);
  assert.equal(isAllowedOrigin("https://attacker.example"), false);
  assert.equal(isAllowedOrigin(undefined), true);
});

test("production requires exact HTTPS frontend origins", () => {
  process.env.NODE_ENV = "production";
  delete process.env.FRONTEND_ORIGINS;
  assert.throws(validateFrontendOrigins, /FRONTEND_ORIGINS must contain the production frontend origin/);

  process.env.FRONTEND_ORIGINS = "https://hostelcast.example";
  assert.doesNotThrow(validateFrontendOrigins);
  assert.equal(isAllowedOrigin("https://hostelcast.example"), true);
  assert.equal(isAllowedOrigin("https://attacker.example"), false);

  process.env.FRONTEND_ORIGINS = "*";
  assert.throws(validateFrontendOrigins, /must contain valid exact origins/);

  process.env.FRONTEND_ORIGINS = "http://hostelcast.example";
  assert.throws(validateFrontendOrigins, /production origins must use HTTPS/);
});

test("CORS callback denies unlisted browser origins", () => {
  process.env.NODE_ENV = "production";
  process.env.FRONTEND_ORIGINS = "https://hostelcast.example";
  let result;

  corsOrigin("https://attacker.example", (error, allowed) => {
    result = { error, allowed };
  });

  assert.deepEqual(result, { error: null, allowed: false });
});
