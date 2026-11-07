function escapeHtml(value) {
  const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" };
  return String(value ?? "").replace(/[&<>"']/g, (character) => entities[character]);
}

module.exports = function otpTemplate(name, otp) {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,sans-serif"><div style="max-width:520px;margin:32px auto;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 12px 40px rgba(0,0,0,.08)"><div style="background:#111827;padding:28px;text-align:center;color:#fff;font-size:24px;font-weight:700">HostelCast</div><div style="padding:32px"><p style="color:#374151;margin-top:0">Hi ${escapeHtml(name)},</p><p style="color:#374151">Use the verification code below to continue with HostelCast.</p><div style="margin:24px 0;padding:20px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:14px;text-align:center;font-size:34px;font-weight:800;letter-spacing:12px;color:#15803d">${escapeHtml(otp)}</div><p style="color:#6b7280;font-size:14px">This code expires in 10 minutes. Please do not share it with anyone.</p><p style="color:#9ca3af;font-size:12px;margin-bottom:0">If you did not request this code, you can safely ignore this email.</p></div></div></body></html>`;
};
