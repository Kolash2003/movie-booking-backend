import { env } from '../config/env';

/**
 * Minimal structured logger with level + request correlation ID.
 * Keeps no external deps for easy unit testing.
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<LogLevel, number> = { trace: 10, debug: 20, info: 30, warn: 40, error: 50 };

type LogMeta = Record<string, unknown>;

function emit(level: LogLevel, msg: string, meta?: LogMeta, correlationId?: string) {
  if (ORDER[level] < ORDER[env.LOG_LEVEL]) return;
  const record = {
    t: new Date().toISOString(),
    level,
    msg,
    ...(correlationId ? { correlationId } : {}),
    ...(meta && Object.keys(meta).length ? meta : {}),
  };
  const line = JSON.stringify(record);
  if (level === 'error') process.stderr.write(line + '\n');
  else process.stdout.write(line + '\n');
}

export interface Logger {
  trace: (msg: string, meta?: LogMeta) => void;
  debug: (msg: string, meta?: LogMeta) => void;
  info: (msg: string, meta?: LogMeta) => void;
  warn: (msg: string, meta?: LogMeta) => void;
  error: (msg: string, meta?: LogMeta) => void;
  child: (ctx: LogMeta) => Logger;
}

export function createLogger(correlationId?: string, bound: LogMeta = {}): Logger {
  const fn = (level: LogLevel) => (msg: string, meta?: LogMeta) =>
    emit(level, msg, { ...bound, ...meta }, correlationId);
  return {
    trace: fn('trace'),
    debug: fn('debug'),
    info: fn('info'),
    warn: fn('warn'),
    error: fn('error'),
    child: (ctx) => createLogger(correlationId, { ...bound, ...ctx }),
  };
}

export const logger = createLogger();