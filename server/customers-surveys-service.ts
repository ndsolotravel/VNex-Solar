import { randomUUID } from 'node:crypto';
import {
  UserRole,
  computeSurveyLoadSummary,
  type CustomerRecord,
  type CustomerType,
  type LoadProfileItemInput,
  type ProjectRecord,
  type RoofSectionInput,
  type SiteHazardInput,
  type SiteRecord,
  type SiteSurveyRecord,
  type SupportedCurrency,
  type SurveyPhotoRecord,
  type SystemType,
} from '../packages/domain/src/index.ts';
import { AuthServiceError, type AccessTokenClaims } from './auth-service.ts';

export class InMemoryCustomersSurveysService {
  private readonly customers = new Map<string, CustomerRecord>();
  private readonly sites = new Map<string, SiteRecord>();
  private readonly projects = new Map<string, ProjectRecord>();
  private readonly surveys = new Map<string, SiteSurveyRecord>();
  private readonly pendingPhotoUploads = new Map<
    string,
    {
      fileAttachmentId: string;
      organizationId: string;
      siteSurveyId: string;
      filename: string;
      mimeType: string;
      byteSize: number;
      sha256Checksum: string;
      storageKey: string;
      caption: string | null;
      status: 'pending' | 'verified';
    }
  >();

  listCustomers(claims: AccessTokenClaims, search?: string): CustomerRecord[] {
    const q = search?.trim().toLowerCase() ?? '';
    return [...this.customers.values()]
      .filter((c) => c.organizationId === claims.orgId)
      .filter(
        (c) =>
          !q ||
          c.fullName.toLowerCase().includes(q) ||
          c.customerCode.toLowerCase().includes(q) ||
          (c.companyName ?? '').toLowerCase().includes(q),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  createCustomer(
    claims: AccessTokenClaims,
    input: {
      id?: string;
      customerType: CustomerType;
      fullName: string;
      companyName?: string | null;
      primaryPhone?: string | null;
      email?: string | null;
      billingAddress?: string | null;
    },
  ): CustomerRecord {
    const id = input.id ?? randomUUID();
    const existing = this.customers.get(id);
    if (existing) {
      throw new AuthServiceError(409, 'Customer ID already exists', 'DUPLICATE_CUSTOMER');
    }
    const now = new Date().toISOString();
    const orgCount = [...this.customers.values()].filter(
      (c) => c.organizationId === claims.orgId,
    ).length;

    const record: CustomerRecord = {
      id,
      organizationId: claims.orgId,
      customerCode: `CUST-${String(orgCount + 1).padStart(4, '0')}`,
      customerType: input.customerType,
      fullName: input.fullName.trim(),
      companyName: input.companyName?.trim() || null,
      primaryPhone: input.primaryPhone?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      billingAddress: input.billingAddress?.trim() || null,
      rowVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.customers.set(id, record);
    return record;
  }

  updateCustomer(
    claims: AccessTokenClaims,
    customerId: string,
    patch: {
      baseRowVersion: number;
      fullName?: string;
      companyName?: string | null;
      primaryPhone?: string | null;
      email?: string | null;
      billingAddress?: string | null;
    },
  ): CustomerRecord {
    const existing = this.customers.get(customerId);
    if (!existing || existing.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Customer not found in active organization', 'NOT_FOUND');
    }
    if (patch.baseRowVersion !== existing.rowVersion) {
      throw new AuthServiceError(
        409,
        `Version conflict: expected ${existing.rowVersion}, got ${patch.baseRowVersion}`,
        'VERSION_CONFLICT',
      );
    }

    if (patch.fullName !== undefined) existing.fullName = patch.fullName.trim();
    if (patch.companyName !== undefined) existing.companyName = patch.companyName;
    if (patch.primaryPhone !== undefined) existing.primaryPhone = patch.primaryPhone;
    if (patch.email !== undefined) existing.email = patch.email;
    if (patch.billingAddress !== undefined) existing.billingAddress = patch.billingAddress;
    existing.rowVersion += 1;
    existing.updatedAt = new Date().toISOString();
    return existing;
  }

  listSitesForCustomer(claims: AccessTokenClaims, customerId: string): SiteRecord[] {
    const customer = this.customers.get(customerId);
    if (!customer || customer.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Customer not found in active organization', 'NOT_FOUND');
    }
    return [...this.sites.values()].filter(
      (s) => s.organizationId === claims.orgId && s.customerId === customerId,
    );
  }

  createSite(
    claims: AccessTokenClaims,
    customerId: string,
    input: {
      id?: string;
      siteName: string;
      addressLine: string;
      city: string;
      countryCode?: string;
      utilityProvider?: string | null;
      meterReference?: string | null;
      connectionPhase?: 'single' | 'three';
    },
  ): SiteRecord {
    const customer = this.customers.get(customerId);
    if (!customer || customer.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Customer not found in active organization', 'NOT_FOUND');
    }
    const id = input.id ?? randomUUID();
    const record: SiteRecord = {
      id,
      organizationId: claims.orgId,
      customerId,
      siteName: input.siteName.trim(),
      addressLine: input.addressLine.trim(),
      city: input.city.trim(),
      countryCode: (input.countryCode ?? 'PK').toUpperCase(),
      utilityProvider: input.utilityProvider?.trim() || null,
      meterReference: input.meterReference?.trim() || null,
      connectionPhase: input.connectionPhase ?? 'three',
      rowVersion: 1,
      createdAt: new Date().toISOString(),
    };
    this.sites.set(id, record);
    return record;
  }

  listProjects(claims: AccessTokenClaims): ProjectRecord[] {
    return [...this.projects.values()]
      .filter((p) => p.organizationId === claims.orgId)
      .filter(
        (p) =>
          claims.role !== UserRole.FIELD_TECHNICIAN || p.assignedUserIds.includes(claims.sub),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  createProject(
    claims: AccessTokenClaims,
    input: {
      id?: string;
      customerId: string;
      siteId: string;
      title: string;
      systemType: SystemType;
      targetCapacityKwp?: number | null;
      currency?: SupportedCurrency;
      assignedUserIds?: string[];
    },
  ): ProjectRecord {
    const customer = this.customers.get(input.customerId);
    const site = this.sites.get(input.siteId);
    if (
      !customer ||
      customer.organizationId !== claims.orgId ||
      !site ||
      site.organizationId !== claims.orgId ||
      site.customerId !== customer.id
    ) {
      throw new AuthServiceError(404, 'Customer or site not found in active organization', 'NOT_FOUND');
    }

    const id = input.id ?? randomUUID();
    const orgCount = [...this.projects.values()].filter(
      (p) => p.organizationId === claims.orgId,
    ).length;
    const now = new Date().toISOString();

    const project: ProjectRecord = {
      id,
      organizationId: claims.orgId,
      customerId: customer.id,
      siteId: site.id,
      projectCode: `PRJ-${String(orgCount + 1).padStart(4, '0')}`,
      title: input.title.trim(),
      systemType: input.systemType,
      targetCapacityKwp: input.targetCapacityKwp ?? null,
      currentStage: 'survey_scheduled',
      status: 'active',
      currency: input.currency ?? 'PKR',
      assignedUserIds: input.assignedUserIds ?? [claims.sub],
      rowVersion: 1,
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(id, project);
    return project;
  }

  getProject(claims: AccessTokenClaims, projectId: string): ProjectRecord {
    const project = this.projects.get(projectId);
    if (!project || project.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Project not found in active organization', 'NOT_FOUND');
    }
    if (
      claims.role === UserRole.FIELD_TECHNICIAN &&
      !project.assignedUserIds.includes(claims.sub)
    ) {
      throw new AuthServiceError(403, 'Field Technician not assigned to this project', 'FORBIDDEN');
    }
    return project;
  }

  advanceProjectStage(claims: AccessTokenClaims, projectId: string, nextStage: string): ProjectRecord {
    const project = this.getProject(claims, projectId);
    project.currentStage = nextStage;
    project.rowVersion += 1;
    project.updatedAt = new Date().toISOString();
    return project;
  }

  addProjectAssignee(claims: AccessTokenClaims, projectId: string, userId: string): ProjectRecord {
    const project = this.getProject(claims, projectId);
    if (!project.assignedUserIds.includes(userId)) {
      project.assignedUserIds.push(userId);
      project.rowVersion += 1;
      project.updatedAt = new Date().toISOString();
    }
    return project;
  }

  listSurveys(claims: AccessTokenClaims, projectId?: string): SiteSurveyRecord[] {
    return [...this.surveys.values()]
      .filter((s) => s.organizationId === claims.orgId)
      .filter((s) => !projectId || s.projectId === projectId)
      .filter((s) => {
        if (claims.role !== UserRole.FIELD_TECHNICIAN) return true;
        const proj = this.projects.get(s.projectId);
        return Boolean(proj && proj.assignedUserIds.includes(claims.sub));
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  createSurvey(
    claims: AccessTokenClaims,
    input: {
      id?: string;
      projectId: string;
      ambientMinTempC?: number;
      ambientMaxTempC?: number;
      earthingAvailable?: boolean;
      notes?: string;
      roofSections?: RoofSectionInput[];
      loadProfiles?: LoadProfileItemInput[];
      siteHazards?: SiteHazardInput[];
    },
  ): SiteSurveyRecord & { summary: ReturnType<typeof computeSurveyLoadSummary> } {
    const project = this.getProject(claims, input.projectId);
    const id = input.id ?? randomUUID();
    const now = new Date().toISOString();
    const roofSections = input.roofSections ?? [];
    const loadProfiles = input.loadProfiles ?? [];
    const siteHazards = input.siteHazards ?? [];

    const survey: SiteSurveyRecord = {
      id,
      organizationId: claims.orgId,
      projectId: project.id,
      siteId: project.siteId,
      surveyorUserId: claims.sub,
      surveyStatus: 'draft',
      surveyedAt: now,
      ambientMinTempC: input.ambientMinTempC ?? 5,
      ambientMaxTempC: input.ambientMaxTempC ?? 46,
      earthingAvailable: input.earthingAvailable ?? false,
      notes: input.notes ?? '',
      roofSections,
      loadProfiles,
      siteHazards,
      photos: [],
      rowVersion: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.surveys.set(id, survey);
    return {
      ...survey,
      summary: computeSurveyLoadSummary(roofSections, loadProfiles),
    };
  }

  getSurvey(claims: AccessTokenClaims, surveyId: string) {
    const survey = this.surveys.get(surveyId);
    if (!survey || survey.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Site survey not found in active organization', 'NOT_FOUND');
    }
    this.getProject(claims, survey.projectId);
    return {
      ...survey,
      summary: computeSurveyLoadSummary(survey.roofSections, survey.loadProfiles),
    };
  }

  updateSurvey(
    claims: AccessTokenClaims,
    surveyId: string,
    input: {
      baseRowVersion: number;
      ambientMinTempC?: number;
      ambientMaxTempC?: number;
      earthingAvailable?: boolean;
      notes?: string;
      roofSections?: RoofSectionInput[];
      loadProfiles?: LoadProfileItemInput[];
      siteHazards?: SiteHazardInput[];
    },
  ) {
    const survey = this.surveys.get(surveyId);
    if (!survey || survey.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Site survey not found in active organization', 'NOT_FOUND');
    }
    this.getProject(claims, survey.projectId);

    if (input.baseRowVersion !== survey.rowVersion) {
      throw new AuthServiceError(
        409,
        `Survey version conflict: expected ${survey.rowVersion}, got ${input.baseRowVersion}`,
        'VERSION_CONFLICT',
      );
    }

    if (input.ambientMinTempC !== undefined) survey.ambientMinTempC = input.ambientMinTempC;
    if (input.ambientMaxTempC !== undefined) survey.ambientMaxTempC = input.ambientMaxTempC;
    if (input.earthingAvailable !== undefined) survey.earthingAvailable = input.earthingAvailable;
    if (input.notes !== undefined) survey.notes = input.notes;
    if (input.roofSections !== undefined) survey.roofSections = input.roofSections;
    if (input.loadProfiles !== undefined) survey.loadProfiles = input.loadProfiles;
    if (input.siteHazards !== undefined) survey.siteHazards = input.siteHazards;
    survey.rowVersion += 1;
    survey.updatedAt = new Date().toISOString();

    return {
      ...survey,
      summary: computeSurveyLoadSummary(survey.roofSections, survey.loadProfiles),
    };
  }

  submitSurvey(claims: AccessTokenClaims, surveyId: string) {
    const survey = this.surveys.get(surveyId);
    if (!survey || survey.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Site survey not found in active organization', 'NOT_FOUND');
    }
    const project = this.getProject(claims, survey.projectId);

    if (survey.roofSections.length === 0) {
      throw new AuthServiceError(
        400,
        'At least one roof section measurement is required before submitting survey',
        'INCOMPLETE_SURVEY',
      );
    }

    survey.surveyStatus = 'submitted';
    survey.rowVersion += 1;
    survey.updatedAt = new Date().toISOString();

    if (project.currentStage === 'lead' || project.currentStage === 'survey_scheduled') {
      project.currentStage = 'survey_completed';
      project.rowVersion += 1;
      project.updatedAt = survey.updatedAt;
    }

    return {
      ...survey,
      summary: computeSurveyLoadSummary(survey.roofSections, survey.loadProfiles),
    };
  }

  presignSurveyPhotoUpload(
    claims: AccessTokenClaims,
    surveyId: string,
    input: {
      filename: string;
      mimeType: string;
      byteSize: number;
      sha256Checksum: string;
      caption?: string | null;
    },
  ) {
    const survey = this.surveys.get(surveyId);
    if (!survey || survey.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Site survey not found in active organization', 'NOT_FOUND');
    }
    this.getProject(claims, survey.projectId);

    const fileAttachmentId = randomUUID();
    const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storageKey = `${claims.orgId}/surveys/${surveyId}/${fileAttachmentId}-${safeName}`;

    this.pendingPhotoUploads.set(fileAttachmentId, {
      fileAttachmentId,
      organizationId: claims.orgId,
      siteSurveyId: surveyId,
      filename: safeName,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      sha256Checksum: input.sha256Checksum,
      storageKey,
      caption: input.caption ?? null,
      status: 'pending',
    });

    return {
      fileAttachmentId,
      storageBucket: 'vnex-private-media',
      storageKey,
      uploadMethod: 'PUT',
      signedUploadPath: `/api/v1/storage/signed-upload/${fileAttachmentId}`,
      expiresInSeconds: 300,
    };
  }

  commitSurveyPhotoUpload(
    claims: AccessTokenClaims,
    surveyId: string,
    input: { fileAttachmentId: string; sha256Checksum: string },
  ): SurveyPhotoRecord {
    const survey = this.surveys.get(surveyId);
    if (!survey || survey.organizationId !== claims.orgId) {
      throw new AuthServiceError(404, 'Site survey not found in active organization', 'NOT_FOUND');
    }
    const pending = this.pendingPhotoUploads.get(input.fileAttachmentId);
    if (
      !pending ||
      pending.organizationId !== claims.orgId ||
      pending.siteSurveyId !== surveyId
    ) {
      throw new AuthServiceError(404, 'Pending upload not found in active organization', 'NOT_FOUND');
    }
    if (pending.sha256Checksum !== input.sha256Checksum) {
      throw new AuthServiceError(
        422,
        'Uploaded file SHA-256 checksum does not match presigned metadata',
        'CHECKSUM_MISMATCH',
      );
    }

    pending.status = 'verified';
    const photo: SurveyPhotoRecord = {
      id: randomUUID(),
      organizationId: claims.orgId,
      siteSurveyId: surveyId,
      fileAttachmentId: pending.fileAttachmentId,
      filename: pending.filename,
      mimeType: pending.mimeType,
      byteSize: pending.byteSize,
      sha256Checksum: pending.sha256Checksum,
      caption: pending.caption,
      capturedAt: new Date().toISOString(),
    };
    survey.photos.push(photo);
    survey.rowVersion += 1;
    survey.updatedAt = photo.capturedAt;
    return photo;
  }

  getAuthorizedPhotoDownload(claims: AccessTokenClaims, fileAttachmentId: string) {
    const upload = this.pendingPhotoUploads.get(fileAttachmentId);
    if (!upload || upload.organizationId !== claims.orgId || upload.status !== 'verified') {
      throw new AuthServiceError(404, 'Attachment not found in active organization', 'NOT_FOUND');
    }
    return {
      fileAttachmentId: upload.fileAttachmentId,
      filename: upload.filename,
      mimeType: upload.mimeType,
      storageBucket: 'vnex-private-media',
      storageKey: upload.storageKey,
      sha256Checksum: upload.sha256Checksum,
      expiresInSeconds: 120,
    };
  }

  // Reconcile offline Room outbox entities pushed via /api/v1/sync/batch
  applyOfflineSyncedEntity(
    claims: AccessTokenClaims,
    entityType: string,
    entityId: string,
    operationType: 'create' | 'update' | 'delete',
    payload: Record<string, unknown>,
  ) {
    if (entityType === 'customer') {
      if (operationType === 'create' && !this.customers.has(entityId)) {
        this.createCustomer(claims, {
          id: entityId,
          customerType: (payload.customerType as CustomerType) ?? 'residential',
          fullName: String(payload.fullName ?? 'Offline Customer'),
          companyName: typeof payload.companyName === 'string' ? payload.companyName : null,
          primaryPhone: typeof payload.primaryPhone === 'string' ? payload.primaryPhone : null,
          email: typeof payload.email === 'string' ? payload.email : null,
          billingAddress:
            typeof payload.billingAddress === 'string' ? payload.billingAddress : null,
        });
      } else if (operationType === 'update') {
        const existing = this.customers.get(entityId);
        if (existing && existing.organizationId === claims.orgId) {
          this.updateCustomer(claims, entityId, {
            baseRowVersion: existing.rowVersion,
            fullName: typeof payload.fullName === 'string' ? payload.fullName : undefined,
            companyName:
              typeof payload.companyName === 'string' || payload.companyName === null
                ? (payload.companyName as string | null)
                : undefined,
            primaryPhone:
              typeof payload.primaryPhone === 'string' || payload.primaryPhone === null
                ? (payload.primaryPhone as string | null)
                : undefined,
            email:
              typeof payload.email === 'string' || payload.email === null
                ? (payload.email as string | null)
                : undefined,
            billingAddress:
              typeof payload.billingAddress === 'string' || payload.billingAddress === null
                ? (payload.billingAddress as string | null)
                : undefined,
          });
        }
      }
    }

    if (entityType === 'site_survey') {
      if (operationType === 'create' && !this.surveys.has(entityId)) {
        const projectId = typeof payload.projectId === 'string' ? payload.projectId : '';
        if (projectId && this.projects.has(projectId)) {
          this.createSurvey(claims, {
            id: entityId,
            projectId,
            ambientMinTempC:
              typeof payload.ambientMinTempC === 'number' ? payload.ambientMinTempC : 5,
            ambientMaxTempC:
              typeof payload.ambientMaxTempC === 'number' ? payload.ambientMaxTempC : 46,
            earthingAvailable: Boolean(payload.earthingAvailable),
            notes: typeof payload.notes === 'string' ? payload.notes : '',
            roofSections: Array.isArray(payload.roofSections)
              ? (payload.roofSections as RoofSectionInput[])
              : [],
            loadProfiles: Array.isArray(payload.loadProfiles)
              ? (payload.loadProfiles as LoadProfileItemInput[])
              : [],
            siteHazards: Array.isArray(payload.siteHazards)
              ? (payload.siteHazards as SiteHazardInput[])
              : [],
          });
        }
      } else if (operationType === 'update') {
        const existing = this.surveys.get(entityId);
        if (existing && existing.organizationId === claims.orgId) {
          this.updateSurvey(claims, entityId, {
            baseRowVersion: existing.rowVersion,
            ambientMinTempC:
              typeof payload.ambientMinTempC === 'number' ? payload.ambientMinTempC : undefined,
            ambientMaxTempC:
              typeof payload.ambientMaxTempC === 'number' ? payload.ambientMaxTempC : undefined,
            earthingAvailable:
              typeof payload.earthingAvailable === 'boolean'
                ? payload.earthingAvailable
                : undefined,
            notes: typeof payload.notes === 'string' ? payload.notes : undefined,
            roofSections: Array.isArray(payload.roofSections)
              ? (payload.roofSections as RoofSectionInput[])
              : undefined,
            loadProfiles: Array.isArray(payload.loadProfiles)
              ? (payload.loadProfiles as LoadProfileItemInput[])
              : undefined,
            siteHazards: Array.isArray(payload.siteHazards)
              ? (payload.siteHazards as SiteHazardInput[])
              : undefined,
          });
        }
      }
    }
  }
}
