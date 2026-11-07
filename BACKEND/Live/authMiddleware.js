const jwt = require("jsonwebtoken");

function requireUser(req, res, next) {
  const authorization = req.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ success: false, message: "Please sign in to use live casts." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (typeof payload === "string" || !payload.id) {
      return res.status(401).json({ success: false, message: "Invalid sign-in session." });
    }
    req.authUserId = payload.id;
    return next();
  } catch {
    return res.status(401).json({ success: false, message: "Your sign-in session expired. Please sign in again." });
  }
}

module.exports = { requireUser };
