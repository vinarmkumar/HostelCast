const otpTemplate = require("../Libs/EmailTemplate");

const BREVO_EMAILS_URL = "https://api.brevo.com/v3/smtp/email";

async function sendEmail(to, subject, htmlContent) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) {
    throw new Error("BREVO_API_KEY and BREVO_SENDER_EMAIL must be configured.");
  }

  const response = await fetch(BREVO_EMAILS_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: "HostelCast", email: senderEmail },
      to: [{ email: to }],
      subject,
      htmlContent,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const responseText = await response.text();
    let providerMessage = "";
    try {
      providerMessage = JSON.parse(responseText).message || "";
    } catch {
      providerMessage = "";
    }
    throw new Error(`Brevo email request failed (${response.status})${providerMessage ? `: ${providerMessage}` : "."}`);
  }
}

async function sendOtpEmail(email, otp, name) {
  await sendEmail(email, "HostelCast verification code", otpTemplate(name, otp));
}

async function sendPasswordResetEmail(email, otp, name) {
  const html = otpTemplate(name, otp).replace("continue with HostelCast", "reset your HostelCast password");
  await sendEmail(email, "Reset your HostelCast password", html);
}

module.exports = { sendOtpEmail, sendPasswordResetEmail };
