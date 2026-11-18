import {
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SyncBatchOperationDto {
  @IsUUID()
  syncOperationId!: string;

  @IsString()
  idempotencyKey!: string;

  @IsString()
  entityType!: string;

  @IsUUID()
  entityId!: string;

  @IsIn(['create', 'update', 'delete'])
  operationType!: 'create' | 'update' | 'delete';

  @IsInt()
  @Min(0)
  baseRowVersion!: number;

  @IsString()
  payloadSha256!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsString()
  clientTimestamp!: string;
}

export class SyncBatchRequestDto {
  @IsString()
  deviceId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncBatchOperationDto)
  operations!: SyncBatchOperationDto[];
}

export class ResolveSyncConflictDto {
  @IsIn(['accept_server', 'merge_client'])
  decision!: 'accept_server' | 'merge_client';

  @IsOptional()
  @IsObject()
  mergedPayload?: Record<string, unknown>;
}
