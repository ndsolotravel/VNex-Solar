import argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import {
  ROLE_DEFINITIONS,
  UserRole,
  hasPermission,
  type PermissionKey,
  type SupportedCurrency,
} from '../packages/domain/src/index.ts';

export interface OrganizationRecord {
  id: string;
  slug: string;
  legalName: string;
  displayName: string;
  businessAddress: string;
  countryCode: string;
  defaultCurrency: SupportedCurrency;
  taxRegistrationNumber: string | null;
  status: 'active' | 'suspended';
  createdAt: string;
}

export interface UserRecord {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  passwordHash: string;
  isActive: boolean;
  createdAt: string;
}

export interface MembershipRecord {
  id: string;
  organizationId: string;
  userId: string;
  role: UserRole;
  status: 'active' | 'invited' | 'suspended';
  createdAt: string;
}

export interface SessionRecord {
  id: string;
  userId: string;
  organizationId: string;
  tokenFamilyId: string;
  refreshTokenHash: string;
  deviceId: string | null;
  expiresAt: string;
  revokedAt: string | null;
  replacedBySessionId: string | null;
  createdAt: string;
}

export interface InvitationRecord {
  id: string;
  organizationId: string;
  email: string;
  role: UserRole;
  tokenHash: string;
  invitedByUserId: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export interface AuditEventRecord {
  id: string;
  organizationId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  requestId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ScopedProjectStub {
  id: string;
  organizationId: string;
  title: string;
  assignedUserIds: string[];
  safetyApproved: boolean;
}

export interface ScopedFileStub {
  id: string;
  organizationId: string;
  filename: string;
  storageKey: string;
}

export interface AccessTokenClaims {
  sub: string;
  orgId: string;
  role: UserRole;
  sessionId: string;
}

export class AuthServiceError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code: string,
  ) {
    super(message);
  }
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function hashPasswordArgon2id(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });
}

export async function verifyPasswordArgon2id(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export class InMemoryAuthTenantService {
  private readonly jwtSecret: Uint8Array;
  private readonly organizations = new Map<string, OrganizationRecord>();
  private readonly users = new Map<string, UserRecord>();
  private readonly usersByEmail = new Map<string, string>();
  private readonly memberships = new Map<string, MembershipRecord>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly sessionsByHash = new Map<string, string>();
  private readonly invitations = new Map<string, InvitationRecord>();
  private readonly auditEvents: AuditEventRecord[] = [];
  private readonly projects = new Map<string, ScopedProjectStub>();
  private readonly files = new Map<string, ScopedFileStub>();

  private readonly failedLoginAttempts = new Map<
    string,
    { count: number; firstAttemptMs: number; lockedUntilMs: number }
  >();
  private readonly maxFailedLoginAttempts: number;
  private readonly lockoutDurationMs: number;

  constructor(
    secretOrOptions?:
      | string
      | {
          jwtSecret?: string;
          maxFailedLoginAttempts?: number;
          lockoutDurationMs?: number;
        },
  ) {
    const opts =
      typeof secretOrOptions === 'string'
        ? { jwtSecret: secretOrOptions }
        : (secretOrOptions ?? {});
    const raw =
      opts.jwtSecret ||
      process.env.JWT_ACCESS_SECRET ||
      'vnex-solar-dev-ephemeral-signing-key-32bytes!';
    this.jwtSecret = new TextEncoder().encode(raw);
    this.maxFailedLoginAttempts = opts.maxFailedLoginAttempts ?? 5;
    this.lockoutDurationMs = opts.lockoutDurationMs ?? 15 * 60_000;
  }

  private recordAudit(
    organizationId: string,
    actorUserId: string | null,
    action: string,
    entityType: string,
    entityId: string | null,
    requestId: string | null,
    payload: Record<string, unknown> = {},
  ): AuditEventRecord {
    const event: AuditEventRecord = {
      id: randomUUID(),
      organizationId,
      actorUserId,
      action,
      entityType,
      entityId,
      requestId,
      payload: { ...payload },
      createdAt: new Date().toISOString(),
    };
    this.auditEvents.push(Object.freeze(event));
    return event;
  }

  private recordFailedLoginAttempt(
    email: string,
    organizationId: string | null,
    requestId: string | null,
  ) {
    const now = Date.now();
    const existing = this.failedLoginAttempts.get(email);
    const withinWindow = existing && now - existing.firstAttemptMs <= this.lockoutDurationMs;
    const count = withinWindow ? existing.count + 1 : 1;
    const firstAttemptMs = withinWindow ? existing.firstAttemptMs : now;
    const lockedUntilMs = count >= this.maxFailedLoginAttempts ? now + this.lockoutDurationMs : 0;
    this.failedLoginAttempts.set(email, { count, firstAttemptMs, lockedUntilMs });

    if (lockedUntilMs > 0 && organizationId) {
      this.recordAudit(organizationId, null, 'auth.login_locked', 'users', null, requestId, {
        email,
        failedAttempts: count,
      });
    }
  }

  private async issueSessionTokens(
    userId: string,
    organizationId: string,
    role: UserRole,
    tokenFamilyId: string,
    deviceId: string | null,
  ) {
    const sessionId = randomUUID();
    const refreshToken = generateOpaqueToken();
    const refreshTokenHash = sha256Hex(refreshToken);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const session: SessionRecord = {
      id: sessionId,
      userId,
      organizationId,
      tokenFamilyId,
      refreshTokenHash,
      deviceId,
      expiresAt,
      revokedAt: null,
      replacedBySessionId: null,
      createdAt: new Date().toISOString(),
    };
    this.sessions.set(sessionId, session);
    this.sessionsByHash.set(refreshTokenHash, sessionId);

    const accessToken = await new SignJWT({
      orgId: organizationId,
      role,
      sessionId,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime('15m')
      .setJti(randomUUID())
      .sign(this.jwtSecret);

    return { accessToken, refreshToken, session };
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, this.jwtSecret);
      const sub = payload.sub;
      const orgId = payload.orgId;
      const role = payload.role as UserRole;
      const sessionId = payload.sessionId;
      if (
        typeof sub !== 'string' ||
        typeof orgId !== 'string' ||
        typeof sessionId !== 'string' ||
        !Object.values(UserRole).includes(role)
      ) {
        throw new Error('Malformed claims');
      }

      const session = this.sessions.get(sessionId);
      if (!session || session.revokedAt !== null || session.organizationId !== orgId) {
        throw new Error('Session revoked');
      }

      const membership = this.findMembership(orgId, sub);
      if (!membership || membership.status !== 'active') {
        throw new Error('Membership inactive');
      }

      return { sub, orgId, role: membership.role, sessionId };
    } catch {
      throw new AuthServiceError(401, 'Invalid or expired access token', 'UNAUTHORIZED');
    }
  }

  private findMembership(organizationId: string, userId: string): MembershipRecord | undefined {
    for (const m of this.memberships.values()) {
      if (m.organizationId === organizationId && m.userId === userId) {
        return m;
      }
    }
    return undefined;
  }

  async registerOrganization(input: {
    legalName: string;
    displayName: string;
    slug: string;
    businessAddress: string;
    countryCode: string;
    defaultCurrency: SupportedCurrency;
    ownerFullName: string;
    ownerEmail: string;
    password: string;
    deviceId?: string;
    requestId?: string | null;
  }) {
    const email = input.ownerEmail.trim().toLowerCase();
    const slug = input.slug.trim().toLowerCase();

    if (this.usersByEmail.has(email)) {
      throw new AuthServiceError(409, 'Email is already registered', 'EMAIL_EXISTS');
    }
    for (const org of this.organizations.values()) {
      if (org.slug === slug) {
        throw new AuthServiceError(409, 'Organization slug already exists', 'SLUG_EXISTS');
      }
    }

    const orgId = randomUUID();
    const userId = randomUUID();
    const now = new Date().toISOString();

    const organization: OrganizationRecord = {
      id: orgId,
      slug,
      legalName: input.legalName.trim(),
      displayName: input.displayName.trim(),
      businessAddress: input.businessAddress.trim(),
      countryCode: input.countryCode.toUpperCase(),
      defaultCurrency: input.defaultCurrency,
      taxRegistrationNumber: null,
      status: 'active',
      createdAt: now,
    };

    const passwordHash = await hashPasswordArgon2id(input.password);
    const user: UserRecord = {
      id: userId,
      email,
      fullName: input.ownerFullName.trim(),
      phone: null,
      passwordHash,
      isActive: true,
      createdAt: now,
    };

    const membership: MembershipRecord = {
      id: randomUUID(),
      organizationId: orgId,
      userId,
      role: UserRole.ORG_OWNER,
      status: 'active',
      createdAt: now,
    };

    this.organizations.set(orgId, organization);
    this.users.set(userId, user);
    this.usersByEmail.set(email, userId);
    this.memberships.set(membership.id, membership);

    const tokens = await this.issueSessionTokens(
      userId,
      orgId,
      UserRole.ORG_OWNER,
      randomUUID(),
      input.deviceId ?? null,
    );

    this.recordAudit(orgId, userId, 'org.registered', 'organizations', orgId, input.requestId ?? null, {
      slug,
      defaultCurrency: organization.defaultCurrency,
    });

    return {
      organization,
      user: { id: user.id, email: user.email, fullName: user.fullName },
      role: membership.role,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      sessionId: tokens.session.id,
    };
  }

  async login(input: {
    email: string;
    password: string;
    organizationSlug?: string;
    deviceId?: string;
    requestId?: string | null;
  }) {
    const email = input.email.trim().toLowerCase();
    const nowMs = Date.now();
    const attempt = this.failedLoginAttempts.get(email);
    if (attempt && attempt.lockedUntilMs > nowMs) {
      throw new AuthServiceError(
        429,
        'Too many failed login attempts; account temporarily locked',
        'ACCOUNT_LOCKED',
      );
    }

    const userId = this.usersByEmail.get(email);
    if (!userId) {
      this.recordFailedLoginAttempt(email, null, input.requestId ?? null);
      throw new AuthServiceError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    const user = this.users.get(userId)!;
    const valid = await verifyPasswordArgon2id(user.passwordHash, input.password);
    if (!valid || !user.isActive) {
      const firstOrg = [...this.memberships.values()].find((m) => m.userId === userId)?.organizationId ?? null;
      this.recordFailedLoginAttempt(email, firstOrg, input.requestId ?? null);
      throw new AuthServiceError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
    }

    this.failedLoginAttempts.delete(email);

    const activeMemberships = [...this.memberships.values()].filter(
      (m) => m.userId === userId && m.status === 'active',
    );
    if (activeMemberships.length === 0) {
      throw new AuthServiceError(403, 'No active organization membership', 'NO_MEMBERSHIP');
    }

    let chosen = activeMemberships[0];
    if (input.organizationSlug) {
      const targetOrg = [...this.organizations.values()].find(
        (o) => o.slug === input.organizationSlug?.trim().toLowerCase(),
      );
      const matched = targetOrg
        ? activeMemberships.find((m) => m.organizationId === targetOrg.id)
        : undefined;
      if (!matched) {
        throw new AuthServiceError(403, 'User is not a member of the requested organization', 'FORBIDDEN_ORG');
      }
      chosen = matched;
    }

    const organization = this.organizations.get(chosen.organizationId)!;
    const tokens = await this.issueSessionTokens(
      userId,
      organization.id,
      chosen.role,
      randomUUID(),
      input.deviceId ?? null,
    );

    this.recordAudit(organization.id, userId, 'auth.login', 'user_sessions', tokens.session.id, input.requestId ?? null, {
      deviceId: input.deviceId ?? null,
    });

    return {
      organization,
      user: { id: user.id, email: user.email, fullName: user.fullName },
      role: chosen.role,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      sessionId: tokens.session.id,
    };
  }

  async refreshSession(input: { refreshToken: string; requestId?: string | null }) {
    const hash = sha256Hex(input.refreshToken);
    const sessionId = this.sessionsByHash.get(hash);
    if (!sessionId) {
      throw new AuthServiceError(401, 'Invalid refresh token', 'INVALID_REFRESH');
    }

    const session = this.sessions.get(sessionId)!;

    // Reuse detection: if token was already rotated or revoked, revoke entire family
    if (session.revokedAt !== null || session.replacedBySessionId !== null) {
      const now = new Date().toISOString();
      for (const s of this.sessions.values()) {
        if (s.tokenFamilyId === session.tokenFamilyId && s.revokedAt === null) {
          s.revokedAt = now;
        }
      }
      this.recordAudit(
        session.organizationId,
        session.userId,
        'auth.refresh_reuse_detected',
        'user_sessions',
        session.id,
        input.requestId ?? null,
        { tokenFamilyId: session.tokenFamilyId },
      );
      throw new AuthServiceError(401, 'Refresh token reuse detected; session family revoked', 'TOKEN_REUSE');
    }

    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      session.revokedAt = new Date().toISOString();
      throw new AuthServiceError(401, 'Refresh token expired', 'REFRESH_EXPIRED');
    }

    const membership = this.findMembership(session.organizationId, session.userId);
    if (!membership || membership.status !== 'active') {
      throw new AuthServiceError(403, 'Membership is not active', 'MEMBERSHIP_INACTIVE');
    }

    const next = await this.issueSessionTokens(
      session.userId,
      session.organizationId,
      membership.role,
      session.tokenFamilyId,
      session.deviceId,
    );

    session.revokedAt = new Date().toISOString();
    session.replacedBySessionId = next.session.id;

    return {
      accessToken: next.accessToken,
      refreshToken: next.refreshToken,
      sessionId: next.session.id,
    };
  }

  logoutSession(claims: AccessTokenClaims, requestId?: string | null) {
    const session = this.sessions.get(claims.sessionId);
    if (session && session.organizationId === claims.orgId && session.revokedAt === null) {
      session.revokedAt = new Date().toISOString();
      this.recordAudit(claims.orgId, claims.sub, 'auth.logout', 'user_sessions', session.id, requestId ?? null);
    }
    return { revoked: true };
  }

  logoutAllOrgSessions(claims: AccessTokenClaims, requestId?: string | null) {
    const now = new Date().toISOString();
    let count = 0;
    for (const s of this.sessions.values()) {
      if (s.userId === claims.sub && s.organizationId === claims.orgId && s.revokedAt === null) {
        s.revokedAt = now;
        count += 1;
      }
    }
    this.recordAudit(claims.orgId, claims.sub, 'auth.logout_all', 'users', claims.sub, requestId ?? null, {
      revokedSessions: count,
    });
    return { revokedCount: count };
  }

  requirePermission(claims: AccessTokenClaims, permission: PermissionKey) {
    if (!hasPermission(claims.role, permission)) {
      throw new AuthServiceError(
        403,
        `Role ${ROLE_DEFINITIONS[claims.role].label} lacks permission ${permission}`,
        'FORBIDDEN_PERMISSION',
      );
    }
  }

  requireAnyPermission(claims: AccessTokenClaims, permissions: ReadonlyArray<PermissionKey>) {
    if (!permissions.some((p) => hasPermission(claims.role, p))) {
      throw new AuthServiceError(
        403,
        `Role ${ROLE_DEFINITIONS[claims.role].label} lacks required permissions (${permissions.join(' or ')})`,
        'FORBIDDEN_PERMISSION',
      );
    }
  }

  getCurrentOrganization(claims: AccessTokenClaims) {
    const org = this.organizations.get(claims.orgId);
    if (!org) {
      throw new AuthServiceError(404, 'Organization not found', 'NOT_FOUND');
    }
    return org;
  }

  updateCurrentOrganization(
    claims: AccessTokenClaims,
    patch: Partial<Pick<OrganizationRecord, 'displayName' | 'businessAddress' | 'defaultCurrency' | 'taxRegistrationNumber'>>,
    requestId?: string | null,
  ) {
    this.requirePermission(claims, 'org:manage');
    const org = this.getCurrentOrganization(claims);
    if (patch.displayName !== undefined) org.displayName = patch.displayName;
    if (patch.businessAddress !== undefined) org.businessAddress = patch.businessAddress;
    if (patch.defaultCurrency !== undefined) org.defaultCurrency = patch.defaultCurrency;
    if (patch.taxRegistrationNumber !== undefined) {
      org.taxRegistrationNumber = patch.taxRegistrationNumber;
    }
    this.recordAudit(claims.orgId, claims.sub, 'org.updated', 'organizations', org.id, requestId ?? null, patch);
    return org;
  }

  async inviteAndProvisionMember(
    claims: AccessTokenClaims,
    input: {
      email: string;
      fullName: string;
      role: UserRole;
      temporaryPassword: string;
    },
    requestId?: string | null,
  ) {
    this.requirePermission(claims, 'users:manage');
    const email = input.email.trim().toLowerCase();

    let userId = this.usersByEmail.get(email);
    if (!userId) {
      userId = randomUUID();
      const passwordHash = await hashPasswordArgon2id(input.temporaryPassword);
      this.users.set(userId, {
        id: userId,
        email,
        fullName: input.fullName.trim(),
        phone: null,
        passwordHash,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
      this.usersByEmail.set(email, userId);
    }

    if (this.findMembership(claims.orgId, userId)) {
      throw new AuthServiceError(409, 'User already belongs to this organization', 'MEMBER_EXISTS');
    }

    const membership: MembershipRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      userId,
      role: input.role,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    this.memberships.set(membership.id, membership);

    const invitation: InvitationRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      email,
      role: input.role,
      tokenHash: sha256Hex(generateOpaqueToken()),
      invitedByUserId: claims.sub,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      acceptedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };
    this.invitations.set(invitation.id, invitation);

    this.recordAudit(claims.orgId, claims.sub, 'org.member_added', 'organization_memberships', membership.id, requestId ?? null, {
      email,
      role: input.role,
    });

    return {
      membership,
      user: {
        id: userId,
        email,
        fullName: this.users.get(userId)!.fullName,
      },
    };
  }

  listOrganizationMembers(claims: AccessTokenClaims) {
    this.requirePermission(claims, 'users:manage');
    return [...this.memberships.values()]
      .filter((m) => m.organizationId === claims.orgId)
      .map((m) => {
        const user = this.users.get(m.userId)!;
        return {
          membershipId: m.id,
          userId: m.userId,
          email: user.email,
          fullName: user.fullName,
          role: m.role,
          roleLabel: ROLE_DEFINITIONS[m.role].label,
          status: m.status,
          createdAt: m.createdAt,
        };
      });
  }

  listAuditEvents(claims: AccessTokenClaims, limit = 50) {
    this.requirePermission(claims, 'org:manage');
    return this.auditEvents
      .filter((e) => e.organizationId === claims.orgId)
      .slice(-limit)
      .reverse();
  }

  // Tenant & resource-scoped verification endpoints for Phase 3 isolation checks
  createProjectStub(claims: AccessTokenClaims, title: string, assignedUserIds: string[] = []) {
    this.requirePermission(claims, 'customers:write');
    const project: ScopedProjectStub = {
      id: randomUUID(),
      organizationId: claims.orgId,
      title,
      assignedUserIds,
      safetyApproved: false,
    };
    this.projects.set(project.id, project);
    return project;
  }

  getProjectStub(claims: AccessTokenClaims, projectId: string): ScopedProjectStub {
    const project = this.projects.get(projectId);
    if (!project || project.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Project not found in active organization', 'NOT_FOUND');
    }

    if (claims.role === UserRole.FIELD_TECHNICIAN && !project.assignedUserIds.includes(claims.sub)) {
      throw new AuthServiceError(403, 'Field Technician cannot access unassigned project', 'RESOURCE_FORBIDDEN');
    }
    return project;
  }

  createFileStub(claims: AccessTokenClaims, filename: string): ScopedFileStub {
    const file: ScopedFileStub = {
      id: randomUUID(),
      organizationId: claims.orgId,
      filename,
      storageKey: `${claims.orgId}/files/${randomUUID()}-${filename}`,
    };
    this.files.set(file.id, file);
    return file;
  }

  getFileDownloadGrant(claims: AccessTokenClaims, fileId: string) {
    const file = this.files.get(fileId);
    if (!file || file.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'File not found in active organization', 'NOT_FOUND');
    }
    return {
      fileId: file.id,
      filename: file.filename,
      storageKey: file.storageKey,
      expiresInSeconds: 120,
    };
  }
}
