type LogLevel = 'info' | 'warn' | 'error' | 'debug';

interface LogEntry {
  level: LogLevel;
  event: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

function log(level: LogLevel, event: string, data?: Record<string, unknown>) {
  const entry: LogEntry = {
    level,
    event,
    data,
    timestamp: new Date().toISOString(),
  };
  // Never log secrets
  if (data) {
    const sanitized = { ...data };
    for (const key of ['password', 'secret', 'apiKey', 'signature', 'token']) {
      if (key in sanitized) sanitized[key] = '[REDACTED]';
    }
    entry.data = sanitized;
  }
  const prefix = `[Kitchen AI] [${entry.timestamp}] [${level.toUpperCase()}] ${event}`;
  if (level === 'error') {
    console.error(prefix, entry.data ?? '');
  } else if (level === 'warn') {
    console.warn(prefix, entry.data ?? '');
  } else {
    console.log(prefix, entry.data ?? '');
  }
}

export const logger = {
  info:  (event: string, data?: Record<string, unknown>) => log('info', event, data),
  warn:  (event: string, data?: Record<string, unknown>) => log('warn', event, data),
  error: (event: string, data?: Record<string, unknown>) => log('error', event, data),
  debug: (event: string, data?: Record<string, unknown>) => log('debug', event, data),
};
