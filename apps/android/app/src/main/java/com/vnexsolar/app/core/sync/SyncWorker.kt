package com.vnexsolar.app.core.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.vnexsolar.app.core.database.VNexDatabase
import com.vnexsolar.app.core.database.entity.SyncCheckpointEntity
import com.vnexsolar.app.core.database.entity.SyncConflictEntity
import com.vnexsolar.app.core.network.SyncApiService
import com.vnexsolar.app.core.network.SyncBatchOperationDto
import com.vnexsolar.app.core.network.SyncBatchRequestDto
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.time.Instant
import java.util.concurrent.TimeUnit
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject

@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val database: VNexDatabase,
    private val syncApiService: SyncApiService,
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val organizationId = inputData.getString(KEY_ORG_ID) ?: return Result.failure()
        val deviceId = inputData.getString(KEY_DEVICE_ID) ?: return Result.failure()

        // Recover any operations left IN_FLIGHT by an unexpected process kill
        database.syncOutboxDao().recoverInterruptedInFlightOps()

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
                            payload = Json.parseToJsonElement(op.payloadJson).jsonObject,
                            clientTimestamp = Instant.ofEpochMilli(op.createdAtEpochMs).toString(),
                        )
                    },
                )

                val response = syncApiService.pushBatch(request)
                for (item in response.results) {
                    when (item.status) {
                        "applied" -> {
                            database.syncOutboxDao().markApplied(item.syncOperationId)
                            if (item.entityType == "customer" && item.newRowVersion != null) {
                                database.customerDao().markSynced(
                                    orgId = organizationId,
                                    id = item.entityId,
                                    newVersion = item.newRowVersion,
                                )
                            }
                        }

                        "conflict" -> {
                            database.syncOutboxDao().markTerminalStatus(
                                operationId = item.syncOperationId,
                                status = "CONFLICT",
                                error = item.reason,
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
                            database.syncOutboxDao().markTerminalStatus(
                                operationId = item.syncOperationId,
                                status = "REJECTED",
                                error = item.reason,
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
                return Result.retry()
            }
        }

        // Pull incremental delta checkpoint
        return try {
            val checkpointKey = "$organizationId:delta"
            val currentSeq = database.syncCheckpointDao().getCheckpoint(checkpointKey)?.lastServerSeq ?: 0L
            val delta = syncApiService.pullDelta(sinceSeq = currentSeq)
            database.syncCheckpointDao().upsertCheckpoint(
                SyncCheckpointEntity(
                    checkpointKey = checkpointKey,
                    organizationId = organizationId,
                    lastServerSeq = delta.nextServerSeq,
                    lastSyncCompletedAtEpochMs = System.currentTimeMillis(),
                ),
            )
            Result.success()
        } catch (_ex: Exception) {
            Result.retry()
        }
    }

    companion object {
        const val KEY_ORG_ID = "org_id"
        const val KEY_DEVICE_ID = "device_id"
        private const val UNIQUE_SYNC_WORK = "vnex_periodic_outbox_sync"

        fun enqueueOneTime(context: Context, organizationId: String, deviceId: String) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(constraints)
                .setInputData(workDataOf(KEY_ORG_ID to organizationId, KEY_DEVICE_ID to deviceId))
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
                .build()

            WorkManager.getInstance(context).enqueueUniqueWork(
                "$UNIQUE_SYNC_WORK:$organizationId",
                ExistingWorkPolicy.APPEND_OR_REPLACE,
                request,
            )
        }
    }
}
