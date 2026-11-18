import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable, tap } from 'rxjs';
import { StructuredLoggerService } from '../logger/structured-logger.service';

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(private readonly logger: StructuredLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    const requestId = (req.headers['x-request-id'] as string) || randomUUID();
    const start = Date.now();
    req.requestId = requestId;
    res.setHeader('x-request-id', requestId);

    return next.handle().pipe(
      tap(() => {
        this.logger.log(
          {
            requestId,
            method: req.method,
            path: req.originalUrl ?? req.url,
            statusCode: res.statusCode,
            latencyMs: Date.now() - start,
            organizationId: req.user?.organizationId ?? null,
          },
          'HTTP',
        );
      }),
    );
  }
}
