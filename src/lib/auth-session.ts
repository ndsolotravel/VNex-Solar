import { UserRole } from '../../packages/domain/src/index.ts';

export interface WebAuthSession {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  organizationName: string;
  organizationId: string;
  userEmail: string;
  role: UserRole;
}
