package com.vnexsolar.app.core.sync

import androidx.room.withTransaction
import com.vnexsolar.app.core.database.VNexDatabase
import com.vnexsolar.app.core.database.entity.CachedEquipmentEntity
import com.vnexsolar.app.core.database.entity.CustomerEntity
import com.vnexsolar.app.core.database.entity.MediaUploadQueueEntity
import com.vnexsolar.app.core.database.entity.SiteSurveyEntity
import com.vnexsolar.app.core.database.entity.SyncOutboxEntity
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow

@Singleton
class OfflineRepository @Inject constructor(
    private val database: VNexDatabase,
) {
    fun observeCustomers(organizationId: String): Flow<List<CustomerEntity>> =
        database.customerDao().observeAll(organizationId)

    fun observeEquipmentCatalog(organizationId: String): Flow<List<CachedEquipmentEntity>> =
        database.cachedEquipmentDao().observeCatalog(organizationId)

    suspend fun cacheEquipmentCatalog(items: List<CachedEquipmentEntity>) {
        database.cachedEquipmentDao().upsertAll(items)
    }

    fun observePendingOutboxCount(organizationId: String): Flow<Int> =
        database.syncOutboxDao().observePendingCount(organizationId)

    /**
     * Atomically writes the local customer entity and enqueues its outbox mutation
     * inside a single Room SQLite transaction so process death cannot lose edits.
     */
    suspend fun saveCustomerOffline(
        organizationId: String,
        customer: CustomerEntity,
        operationType: String,
        payloadJson: String,
    ): String {
        val syncOperationId = UUID.randomUUID().toString()
        val idempotencyKey = "customer:$operationType:${customer.id}:$syncOperationId"
        val outboxEntry = SyncOutboxEntity(
            syncOperationId = syncOperationId,
            organizationId = organizationId,
            idempotencyKey = idempotencyKey,
            entityType = "customer",
            entityId = customer.id,
            operationType = operationType,
            baseRowVersion = if (operationType == "create") 0 else customer.rowVersion,
            payloadJson = payloadJson,
            payloadSha256 = ChecksumUtil.sha256Hex(payloadJson.toByteArray(Charsets.UTF_8)),
            status = "PENDING",
            createdAtEpochMs = System.currentTimeMillis(),
        )

        database.withTransaction {
            database.customerDao().upsert(customer)
            database.syncOutboxDao().enqueue(outboxEntry)
        }
        return syncOperationId
    }

    suspend fun saveSiteSurveyOffline(
        organizationId: String,
        survey: SiteSurveyEntity,
        operationType: String,
        payloadJson: String,
    ): String {
        val syncOperationId = UUID.randomUUID().toString()
        val idempotencyKey = "site_survey:$operationType:${survey.id}:$syncOperationId"
        val outboxEntry = SyncOutboxEntity(
            syncOperationId = syncOperationId,
            organizationId = organizationId,
            idempotencyKey = idempotencyKey,
            entityType = "site_survey",
            entityId = survey.id,
            operationType = operationType,
            baseRowVersion = if (operationType == "create") 0 else survey.rowVersion,
            payloadJson = payloadJson,
            payloadSha256 = ChecksumUtil.sha256Hex(payloadJson.toByteArray(Charsets.UTF_8)),
            status = "PENDING",
            createdAtEpochMs = System.currentTimeMillis(),
        )

        database.withTransaction {
            database.siteSurveyDao().upsert(survey)
            database.syncOutboxDao().enqueue(outboxEntry)
        }
        return syncOperationId
    }

    suspend fun enqueueMediaAttachment(
        organizationId: String,
        entityType: String,
        entityId: String,
        localFilePath: String,
        mimeType: String,
        fileBytes: ByteArray,
    ): String {
        val mediaId = UUID.randomUUID().toString()
        val item = MediaUploadQueueEntity(
            mediaId = mediaId,
            organizationId = organizationId,
            entityType = entityType,
            entityId = entityId,
            localFilePath = localFilePath,
            compressedFilePath = null,
            mimeType = mimeType,
            byteSize = fileBytes.size.toLong(),
            sha256Checksum = ChecksumUtil.sha256Hex(fileBytes),
            status = "PENDING",
            createdAtEpochMs = System.currentTimeMillis(),
        )
        database.mediaUploadQueueDao().enqueue(item)
        return mediaId
    }

    suspend fun enqueueEntityOutboxMutation(
        organizationId: String,
        entityType: String,
        entityId: String,
        operationType: String,
        baseRowVersion: Int,
        payloadJson: String,
    ): String {
        val syncOperationId = UUID.randomUUID().toString()
        val idempotencyKey = "$entityType:$operationType:$entityId:$syncOperationId"
        val outboxEntry = SyncOutboxEntity(
            syncOperationId = syncOperationId,
            organizationId = organizationId,
            idempotencyKey = idempotencyKey,
            entityType = entityType,
            entityId = entityId,
            operationType = operationType,
            baseRowVersion = baseRowVersion,
            payloadJson = payloadJson,
            payloadSha256 = ChecksumUtil.sha256Hex(payloadJson.toByteArray(Charsets.UTF_8)),
            status = "PENDING",
            createdAtEpochMs = System.currentTimeMillis(),
        )
        database.syncOutboxDao().enqueue(outboxEntry)
        return syncOperationId
    }

    suspend fun recoverAfterProcessTermination(): Pair<Int, Int> {
        val outboxRecovered = database.syncOutboxDao().recoverInterruptedInFlightOps()
        val mediaRecovered = database.mediaUploadQueueDao().recoverInterruptedUploads()
        return outboxRecovered to mediaRecovered
    }
}
