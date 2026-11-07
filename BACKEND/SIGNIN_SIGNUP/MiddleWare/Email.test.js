const test = require("node:test");
const assert = require("node:assert/strict");
const { sendOtpEmail, sendPasswordResetEmail } = require("./Email");

const originalFetch = global.fetch;
const originalApiKey = process.env.BREVO_API_KEY;
const originalSenderEmail = process.env.BREVO_SENDER_EMAIL;

test.afterEach(() => {
  global.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.BREVO_API_KEY;
  else process.env.BREVO_API_KEY = originalApiKey;
  if (originalSenderEmail === undefined) delete process.env.BREVO_SENDER_EMAIL;
  else process.env.BREVO_SENDER_EMAIL = originalSenderEmail;
});

test("sends signup OTP through Brevo with the configured sender", async () => {
  let request;
  process.env.BREVO_API_KEY = "test-api-key";
  process.env.BREVO_SENDER_EMAIL = "verified@example.com";
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true, status: 201 };
  };

  await sendOtpEmail("student@example.edu", "123456", "<Student>");

  assert.equal(request.url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["api-key"], "test-api-key");
  const body = JSON.parse(request.options.body);
  assert.deepEqual(body.sender, { name: "HostelCast", email: "verified@example.com" });
  assert.deepEqual(body.to, [{ email: "student@example.edu" }]);
  assert.equal(body.subject, "HostelCast verification code");
  assert.match(body.htmlContent, /Hi &lt;Student&gt;/);
  assert.match(body.htmlContent, />123456</);
});

test("uses the password-reset message with the same configured sender", async () => {
  let body;
  process.env.BREVO_API_KEY = "test-api-key";
  process.env.BREVO_SENDER_EMAIL = "verified@example.com";
  global.fetch = async (_url, options) => {
    body = JSON.parse(options.body);
    return { ok: true, status: 201 };
  };

  await sendPasswordResetEmail("student@example.edu", "654321", "Student");

  assert.equal(body.subject, "Reset your HostelCast password");
  assert.match(body.htmlContent, /reset your HostelCast password/);
});

test("reports missing Brevo configuration without making a request", async () => {
  process.env.BREVO_API_KEY = "";
  process.env.BREVO_SENDER_EMAIL = "";
  global.fetch = async () => {
    assert.fail("fetch must not be called without configuration");
  };

  await assert.rejects(sendOtpEmail("student@example.edu", "123456", "Student"), /BREVO_API_KEY and BREVO_SENDER_EMAIL/);
});

test("reports Brevo errors without exposing the API key", async () => {
  const apiKey = "test-secret-key";
  process.env.BREVO_API_KEY = apiKey;
  process.env.BREVO_SENDER_EMAIL = "verified@example.com";
  global.fetch = async () => ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({ message: "Invalid API key." }),
  });

  await assert.rejects(
    sendOtpEmail("student@example.edu", "123456", "Student"),
    (error) => {
      assert.match(error.message, /Brevo email request failed \(401\): Invalid API key\./);
      assert.doesNotMatch(error.message, new RegExp(apiKey));
      return true;
    }
  );
});
