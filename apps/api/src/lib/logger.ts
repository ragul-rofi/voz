import pino from "pino";

export const logger = pino({
  level: process.env.NODE_ENV === "development" ? "debug" : "info",
  redact: {
    paths: ["req.headers.authorization", "META_ACCESS_TOKEN", "*apiKey*", "*token*"],
    censor: "[REDACTED]",
  },
});
