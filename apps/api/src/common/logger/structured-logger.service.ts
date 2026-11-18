import { Injectable, LoggerService } from '@nestjs/common';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordHash',
  'authorization',
  'cookie',
  'refreshToken',
  'accessToken',
  'secret',
]);

export function redactSensitiveFields(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map(redactSensitiveFields);
  }
  if (input && typeof input === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k) ? '[REDACTED]' : redactSensitiveFields(v);
    }
    return out;
  }
  return input;
}

@Injectable()
export class StructuredLoggerService implements LoggerService {
  private write(level: 'info' | 'warn' | 'error' | 'debug', message: unknown, context?: string) {
    const entry = {
      ts: new Date().toISOString(),
      level,
      service: 'vnex-solar-api',
      context: context ?? 'Application',
      message: typeof message === 'string' ? message : redactSensitiveFields(message),
    };
    process.stdout.write(`${JSON.stringify(entry)}\n`);
  }

  log(message: unknown, context?: string) {
    this.write('info', message, context);
  }
  error(message: unknown, _trace?: string, context?: string) {
    this.write('error', message, context);
  }
  warn(message: unknown, context?: string) {
    this.write('warn', message, context);
  }
  debug(message: unknown, context?: string) {
    this.write('debug', message, context);
  }
}
