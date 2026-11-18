import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('System')
@Controller({ path: 'health', version: '1' })
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Service readiness probe' })
  getHealth() {
    return {
      service: 'vnex-solar-api',
      status: 'ok',
      apiVersion: 'v1',
      orm: 'drizzle-postgresql',
      timestamp: new Date().toISOString(),
    };
  }
}
