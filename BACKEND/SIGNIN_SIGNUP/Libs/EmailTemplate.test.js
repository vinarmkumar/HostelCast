const test = require("node:test");
const assert = require("node:assert/strict");
const otpTemplate = require("./EmailTemplate");

test("escapes untrusted values in the verification email", () => {
  const html = otpTemplate('<img src=x onerror="alert(1)"> & \'', "<svg/onload=alert(1)>");

  assert.ok(html.includes('Hi &lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;,'));
  assert.ok(html.includes("&lt;svg/onload=alert(1)&gt;"));
  assert.doesNotMatch(html, /<img|<svg/i);
});
