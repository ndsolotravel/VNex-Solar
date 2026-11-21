package com.vnexsolar.app.core.sync

import com.vnexsolar.app.core.database.VNexDatabase
import com.vnexsolar.app.core.database.entity.CustomerEntity
import com.vnexsolar.app.core.database.entity.SyncCheckpointEntity
import com.vnexsolar.app.core.database.entity.SyncConflictEntity
import com.vnexsolar.app.core.network.PresignSyncMediaRequestDto
import com.vnexsolar.app.core.network.ResolveConflictRequestDto
import com.vnexsolar.app.core.network.SyncApiService
import com.vnexsolar.app.core.network.SyncBatchOperationDto
import com.vnexsolar.app.core.network.SyncBatchRequestDto
import com.vnexsolar.app.core.network.UpdateCheckpointRequestDto
import com.vnexsolar.app.core.network.VerifySyncMediaRequestDto
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

data class SyncCycleResult(
    val succeeded: Boolean,
    val appliedCount: Int = 0,
    val deduplicatedCount: Int = 0,
    val conflictCount: Int = 0,
    val rejectedCount: Int = 0,
    val mediaVerifiedCount: Int = 0,
    val deltaChangesApplied: Int = 0,
    val latestServerSeq: Long = 0L,
    val syncedAtEpochMs: Long = System.currentTimeMillis(),
    val errorMessage: String? = null,
)

@Singleton
class SyncEngine @Inject constructor(
    private val database: VNexDatabase,
    private val syncApiService: SyncApiService,
) {
    private val json = Json { ignoreUnknownKeys = true }

    suspend fun runSyncCycle(
        organizationId: String,
        deviceId: String,
    ): SyncCycleResult {
        if (organizationId.isBlank() || deviceId.isBlank()) {
            return SyncCycleResult(succeeded = false, errorMessage = "Missing organization or device ID")
        }

        // 1. Recover any operations left IN_FLIGHT or UPLOADING across unexpected process termination
        database.syncOutboxDao().recoverInterruptedInFlightOps()
        database.mediaUploadQueueDao().recoverInterruptedUploads()

        var appliedCount = 0
        var deduplicatedCount = 0
        var conflictCount = 0
        var rejectedCount = 0
        var mediaVerifiedCount = 0

        // 2. Push pending/retryable outbox operations
        val now = System.currentTimeMillis()
        val pendingOps = database.syncOutboxDao().fetchDispatchable(organizationId, now)
        if (pendingOps.isNotEmpty()) {
            database.syncOutboxDao().markInFlight(pendingOps.map { it.syncOperationId })
            try {
                val request = SyncBatchRequestDto(
                    deviceId = deviceId,
                    operations = pendingOps.map { op ->
                        SyncBatchOperationDto(
                            syncOperationId = op.syncOperationId,
                            idempotencyKey = op.idempotencyKey,
                            entityType = op.entityType,
                            entityId = op.entityId,
                            operationType = op.operationType,
                            baseRowVersion = op.baseRowVersion,
                            payloadSha256 = op.payloadSha256,
                            payload = json.parseToJsonElement(op.payloadJson).jsonObject,
                            clientTimestamp = Instant.ofEpochMilli(op.createdAtEpochMs).toString(),
                        )
                    },
                )
                val response = syncApiService.pushBatch(request)
                for (item in response.results) {
                    when (item.status) {
                        "applied" -> {
                            database.syncOutboxDao().markApplied(item.syncOperationId)
                            appliedCount += 1
                            if (item.deduplicated) deduplicatedCount += 1
                            if (item.entityType == "customer" && item.newRowVersion != null) {
                                database.customerDao().markSynced(
                                    orgId = organizationId,
                                    id = item.entityId,
                                    newVersion = item.newRowVersion,
                                )
                            }
                        }

                        "conflict" -> {
                            conflictCount += 1
                            database.syncOutboxDao().markTerminalStatus(
                                operationId = item.syncOperationId,
                                status = "CONFLICT",
                                error = item.reason ?: "Version conflict detected",
                            )
                            val original = pendingOps.find { it.syncOperationId == item.syncOperationId }
                            if (item.conflictId != null && original != null) {
                                database.syncConflictDao().upsert(
                                    SyncConflictEntity(
                                        conflictId = item.conflictId,
                                        organizationId = organizationId,
                                        syncOperationId = item.syncOperationId,
                                        entityType = item.entityType,
                                        entityId = item.entityId,
                                        clientPayloadJson = original.payloadJson,
                                        serverSnapshotJson = item.serverSnapshot?.toString() ?: "{}",
                                        resolutionStatus = "PENDING",
                                        createdAtEpochMs = System.currentTimeMillis(),
                                    ),
                                )
                            }
                        }

                        else -> {
                            rejectedCount += 1
                            database.syncOutboxDao().markTerminalStatus(
                                operationId = item.syncOperationId,
                                status = "REJECTED",
                                error = item.reason ?: "Rejected by server policy",
                            )
                        }
                    }
                }
            } catch (ex: Exception) {
                val errMsg = ex.message ?: "Network error"
                for (op in pendingOps) {
                    val delay = ChecksumUtil.computeRetryBackoffMs(op.retryCount)
                    database.syncOutboxDao().markRetryableFailure(
                        operationId = op.syncOperationId,
                        nextRetryAtEpochMs = System.currentTimeMillis() + delay,
                        error = errMsg,
                    )
                }
                return SyncCycleResult(
                    succeeded = false,
                    errorMessage = errMsg,
                )
            }
        }

        // 3. Process queued media attachments (presign + SHA-256 verification)
        val pendingMedia = database.mediaUploadQueueDao().fetchPending(organizationId)
        for (media in pendingMedia) {
            try {
                database.mediaUploadQueueDao().markUploading(media.mediaId)
                val filename = media.localFilePath.substringAfterLast('/').ifBlank { "${media.mediaId}.jpg" }
                val presign = syncApiService.presignMediaUpload(
                    PresignSyncMediaRequestDto(
                        deviceId = deviceId,
                        entityType = media.entityType,
                        entityId = media.entityId,
                        filename = filename,
                        mimeType = media.mimeType,
                        byteSize = media.byteSize.coerceAtLeast(1L),
                        expectedSha256 = media.sha256Checksum,
                    ),
                )
                val verified = syncApiService.verifyMediaUpload(
                    mediaId = presign.id,
                    request = VerifySyncMediaRequestDto(actualSha256 = media.sha256Checksum),
                )
                database.mediaUploadQueueDao().markVerified(media.mediaId, verified.id)
                mediaVerifiedCount += 1
            } catch (ex: Exception) {
                database.mediaUploadQueueDao().markRetryableFailure(
                    mediaId = media.mediaId,
                    error = ex.message ?: "Media upload error",
                )
            }
        }

        // 4. Pull incremental delta checkpoint (paginated) & persist checkpoint
        return try {
            val checkpointKey = "$organizationId:delta"
            var cursor = database.syncCheckpointDao().getCheckpoint(checkpointKey)?.lastServerSeq ?: 0L
            var totalChangesApplied = 0
            var pageGuard = 0

            while (pageGuard < 20) {
                pageGuard += 1
                val delta = syncApiService.pullDelta(sinceSeq = cursor, limit = 50)
                for (change in delta.changes) {
                    applyDeltaChange(organizationId, change.entityType, change.entityId, change.rowVersion, change.data.toString(), change.updatedAt)
                    totalChangesApplied += 1
                }
                cursor = delta.nextServerSeq
                if (!delta.hasMore || delta.changes.isEmpty()) break
            }

            // Refresh any server-side pending conflicts into Room
            runCatching {
                val remoteConflicts = syncApiService.listConflicts().conflicts
                for (c in remoteConflicts.filter { it.resolutionStatus == "pending" }) {
                    database.syncConflictDao().upsert(
                        SyncConflictEntity(
                            conflictId = c.id,
                            organizationId = organizationId,
                            syncOperationId = c.syncOperationId,
                            entityType = c.entityType,
                            entityId = c.entityId,
                            clientPayloadJson = c.clientPayload?.toString() ?: "{}",
                            serverSnapshotJson = c.serverSnapshot?.toString() ?: "{}",
                            resolutionStatus = "PENDING",
                            createdAtEpochMs = System.currentTimeMillis(),
                        ),
                    )
                }
            }

            val completedAt = System.currentTimeMillis()
            database.syncCheckpointDao().upsertCheckpoint(
                SyncCheckpointEntity(
                    checkpointKey = checkpointKey,
                    organizationId = organizationId,
                    lastServerSeq = cursor,
                    lastSyncCompletedAtEpochMs = completedAt,
                ),
            )
            runCatching {
                syncApiService.updateCheckpoint(deviceId, UpdateCheckpointRequestDto(lastServerSeq = cursor))
            }

            SyncCycleResult(
                succeeded = true,
                appliedCount = appliedCount,
                deduplicatedCount = deduplicatedCount,
                conflictCount = conflictCount,
                rejectedCount = rejectedCount,
                mediaVerifiedCount = mediaVerifiedCount,
                deltaChangesApplied = totalChangesApplied,
                latestServerSeq = cursor,
                syncedAtEpochMs = completedAt,
            )
        } catch (ex: Exception) {
            SyncCycleResult(
                succeeded = false,
                appliedCount = appliedCount,
                deduplicatedCount = deduplicatedCount,
                conflictCount = conflictCount,
                rejectedCount = rejectedCount,
                mediaVerifiedCount = mediaVerifiedCount,
                errorMessage = ex.message ?: "Delta sync failed",
            )
        }
    }

    suspend fun resolveConflict(
        conflict: SyncConflictEntity,
        decision: String, // accept_server | merge_client
    ) {
        val mergedPayloadObj = if (decision == "merge_client") {
            runCatching { json.parseToJsonElement(conflict.clientPayloadJson).jsonObject }.getOrNull()
        } else {
            null
        }
        syncApiService.resolveConflict(
            conflictId = conflict.conflictId,
            request = ResolveConflictRequestDto(
                decision = decision,
                mergedPayload = mergedPayloadObj,
            ),
        )
        val resolvedStatus = if (decision == "merge_client") "MERGED_CLIENT" else "ACCEPTED_SERVER"
        database.syncConflictDao().markResolved(conflict.conflictId, resolvedStatus)
        database.syncOutboxDao().markApplied(conflict.syncOperationId)
    }

    private suspend fun applyDeltaChange(
        organizationId: String,
        entityType: String,
        entityId: String,
        rowVersion: Int,
        dataJson: String,
        updatedAt: String,
    ) {
        if (entityType == "customer") {
            val obj = runCatching { json.parseToJsonElement(dataJson).jsonObject }.getOrNull() ?: return
            val fullName = obj["fullName"]?.jsonPrimitive?.contentOrNull ?: return
            val customerCode = obj["customerCode"]?.jsonPrimitive?.contentOrNull ?: "CUST-SYNC"
            val customerType = obj["customerType"]?.jsonPrimitive?.contentOrNull ?: "residential"
            val existing = database.customerDao().getById(organizationId, entityId)
            if (existing == null || rowVersion >= existing.rowVersion) {
                database.customerDao().upsert(
                    CustomerEntity(
                        id = entityId,
                        organizationId = organizationId,
                        customerCode = customerCode,
                        customerType = customerType,
                        fullName = fullName,
                        companyName = obj["companyName"]?.jsonPrimitive?.contentOrNull,
                        primaryPhone = obj["primaryPhone"]?.jsonPrimitive?.contentOrNull,
                        email = obj["email"]?.jsonPrimitive?.contentOrNull,
                        billingAddress = obj["billingAddress"]?.jsonPrimitive?.contentOrNull,
                        rowVersion = rowVersion,
                        syncState = "SYNCED",
                        updatedAtEpochMs = runCatching { Instant.parse(updatedAt).toEpochMilli() }.getOrElse { System.currentTimeMillis() },
                    ),
                )
            }
        }
    }
}
