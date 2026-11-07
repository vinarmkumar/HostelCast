const LOCAL_FRONTEND_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

function getFrontendOrigins() {
  const configuredOrigins = process.env.FRONTEND_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (configuredOrigins?.length) return configuredOrigins;
  return process.env.NODE_ENV === "production" ? [] : LOCAL_FRONTEND_ORIGINS;
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  return getFrontendOrigins().includes(origin);
}

function corsOrigin(origin, callback) {
  callback(null, isAllowedOrigin(origin));
}

function validateFrontendOrigins() {
  const configuredOrigins = process.env.FRONTEND_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) || [];
  if (process.env.NODE_ENV === "production" && configuredOrigins.length === 0) {
    throw new Error("FRONTEND_ORIGINS must contain the production frontend origin.");
  }
  for (const origin of configuredOrigins) {
    let parsedOrigin;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw new Error("FRONTEND_ORIGINS must contain valid exact origins.");
    }
    if (parsedOrigin.origin !== origin || (process.env.NODE_ENV === "production" && parsedOrigin.protocol !== "https:")) {
      throw new Error("FRONTEND_ORIGINS must contain exact origins; production origins must use HTTPS.");
    }
  }
}

module.exports = { corsOrigin, isAllowedOrigin, validateFrontendOrigins };
