type LogLevel = "info" | "warn" | "error";

type LogEntry = {
  level: LogLevel;
  msg: string;
  [key: string]: unknown;
};

function log(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
  const entry: LogEntry = { level, msg, ...meta };
  if (process.env.NODE_ENV === "production") {
    // Structured JSON for log aggregators (Vercel, Datadog, etc.)
    const out = JSON.stringify({ ts: new Date().toISOString(), ...entry });
    level === "error" ? console.error(out) : console.log(out);
  } else {
    const prefix = `[${level.toUpperCase()}]`;
    const detail = meta ? ` ${JSON.stringify(meta)}` : "";
    level === "error"
      ? console.error(prefix, msg, detail)
      : level === "warn"
      ? console.warn(prefix, msg, detail)
      : console.log(prefix, msg, detail);
  }
}

export const logger = {
  info:  (msg: string, meta?: Record<string, unknown>) => log("info",  msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => log("warn",  msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
};
