import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { permissions?: string[]; organizationId?: string } | undefined;

    if (!user?.organizationId || !Array.isArray(user.permissions)) {
      throw new ForbiddenException('Missing authenticated tenant security context');
    }

    const hasAll = required.every((perm) => user.permissions!.includes(perm));
    if (!hasAll) {
      throw new ForbiddenException(`Missing required permissions: ${required.join(', ')}`);
    }
    return true;
  }
}
