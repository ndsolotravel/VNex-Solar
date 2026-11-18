package com.vnexsolar.app.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "customers",
    indices = [Index(value = ["organizationId", "updatedAtEpochMs"])],
)
data class CustomerEntity(
    @PrimaryKey val id: String,
    val organizationId: String,
    val customerCode: String,
    val customerType: String,
    val fullName: String,
    val companyName: String?,
    val primaryPhone: String?,
    val email: String?,
    val billingAddress: String?,
    val rowVersion: Int = 1,
    val syncState: String = "PENDING",
    val updatedAtEpochMs: Long,
)

@Entity(
    tableName = "site_surveys",
    indices = [Index(value = ["organizationId", "projectId"])],
)
data class SiteSurveyEntity(
    @PrimaryKey val id: String,
    val organizationId: String,
    val projectId: String,
    val siteId: String,
    val surveyorUserId: String,
    val surveyStatus: String = "draft",
    val ambientMinTempC: Double?,
    val ambientMaxTempC: Double?,
    val earthingAvailable: Boolean = false,
    val notes: String?,
    val rowVersion: Int = 1,
    val syncState: String = "PENDING",
    val updatedAtEpochMs: Long,
)

@Entity(
    tableName = "cached_equipment",
    indices = [Index(value = ["organizationId", "category"])],
)
data class CachedEquipmentEntity(
    @PrimaryKey val id: String,
    val organizationId: String,
    val sku: String,
    val category: String,
    val modelName: String,
    val specsJson: String,
    val unitSellPriceDecimal: String,
    val currency: String,
    val updatedAtEpochMs: Long,
)

@Entity(
    tableName = "sync_outbox",
    indices = [
        Index(value = ["idempotencyKey"], unique = true),
        Index(value = ["status", "nextRetryAtEpochMs"]),
    ],
)
data class SyncOutboxEntity(
    @PrimaryKey val syncOperationId: String,
    val organizationId: String,
    val idempotencyKey: String,
    val entityType: String,
    val entityId: String,
    val operationType: String,
    val baseRowVersion: Int,
    val payloadJson: String,
    val payloadSha256: String,
    val status: String = "PENDING", // PENDING, IN_FLIGHT, APPLIED, CONFLICT, REJECTED, FAILED_RETRYABLE
    val retryCount: Int = 0,
    val nextRetryAtEpochMs: Long = 0L,
    val lastError: String? = null,
    val createdAtEpochMs: Long,
)

@Entity(
    tableName = "media_upload_queue",
    indices = [Index(value = ["status", "createdAtEpochMs"])],
)
data class MediaUploadQueueEntity(
    @PrimaryKey val mediaId: String,
    val organizationId: String,
    val entityType: String,
    val entityId: String,
    val localFilePath: String,
    val compressedFilePath: String?,
    val mimeType: String,
    val byteSize: Long,
    val sha256Checksum: String,
    val status: String = "PENDING", // PENDING, UPLOADING, VERIFIED, FAILED_RETRYABLE
    val retryCount: Int = 0,
    val remoteAttachmentId: String? = null,
    val lastError: String? = null,
    val createdAtEpochMs: Long,
)

@Entity(
    tableName = "sync_conflicts",
    indices = [Index(value = ["organizationId", "resolutionStatus"])],
)
data class SyncConflictEntity(
    @PrimaryKey val conflictId: String,
    val organizationId: String,
    val syncOperationId: String,
    val entityType: String,
    val entityId: String,
    val clientPayloadJson: String,
    val serverSnapshotJson: String,
    val resolutionStatus: String = "PENDING",
    val createdAtEpochMs: Long,
)

@Entity(tableName = "sync_checkpoints")
data class SyncCheckpointEntity(
    @PrimaryKey val checkpointKey: String, // "$organizationId:delta"
    val organizationId: String,
    val lastServerSeq: Long = 0L,
    val lastSyncCompletedAtEpochMs: Long = 0L,
)
