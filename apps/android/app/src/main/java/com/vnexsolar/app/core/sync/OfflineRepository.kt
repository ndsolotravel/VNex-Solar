package com.vnexsolar.app.core.sync

import androidx.room.withTransaction
import com.vnexsolar.app.core.database.VNexDatabase
import com.vnexsolar.app.core.database.entity.CachedEquipmentEntity
import com.vnexsolar.app.core.database.entity.CachedQuotationEntity
import com.vnexsolar.app.core.database.entity.CustomerEntity
import com.vnexsolar.app.core.database.entity.DashboardSnapshotEntity
import com.vnexsolar.app.core.database.entity.DraftExpenseEntity
import com.vnexsolar.app.core.database.entity.MediaUploadQueueEntity
import com.vnexsolar.app.core.database.entity.ProjectEntity
import com.vnexsolar.app.core.database.entity.SiteEntity
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

    suspend fun cacheCustomers(items: List<CustomerEntity>) {
        if (items.isNotEmpty()) {
            database.customerDao().upsertAll(items)
        }
    }

    fun observeProjects(organizationId: String): Flow<List<ProjectEntity>> =
        database.projectDao().observeAll(organizationId)

    suspend fun cacheProjects(items: List<ProjectEntity>) {
        if (items.isNotEmpty()) {
            database.projectDao().upsertAll(items)
        }
    }

    suspend fun upsertProject(project: ProjectEntity) {
        database.projectDao().upsert(project)
    }

    fun observeAllSites(organizationId: String): Flow<List<SiteEntity>> =
        database.siteDao().observeAll(organizationId)

    fun observeSitesForCustomer(organizationId: String, customerId: String): Flow<List<SiteEntity>> =
        database.siteDao().observeForCustomer(organizationId, customerId)

    suspend fun cacheSites(items: List<SiteEntity>) {
        if (items.isNotEmpty()) {
            database.siteDao().upsertAll(items)
        }
    }

    suspend fun upsertSite(site: SiteEntity) {
        database.siteDao().upsert(site)
    }

    suspend fun getDashboardSnapshot(organizationId: String, rangeKey: String): DashboardSnapshotEntity? =
        database.dashboardSnapshotDao().getSnapshot("$organizationId:$rangeKey")

    suspend fun saveDashboardSnapshot(organizationId: String, rangeKey: String, payloadJson: String) {
        database.dashboardSnapshotDao().upsert(
            DashboardSnapshotEntity(
                snapshotKey = "$organizationId:$rangeKey",
                organizationId = organizationId,
                rangeKey = rangeKey,
                payloadJson = payloadJson,
                updatedAtEpochMs = System.currentTimeMillis(),
            ),
        )
    }

    fun observeEquipmentCatalog(organizationId: String): Flow<List<CachedEquipmentEntity>> =
        database.cachedEquipmentDao().observeCatalog(organizationId)

    suspend fun cacheEquipmentCatalog(items: List<CachedEquipmentEntity>) {
        database.cachedEquipmentDao().upsertAll(items)
    }

    fun observeDraftExpenses(organizationId: String): Flow<List<DraftExpenseEntity>> =
        database.draftExpenseDao().observeAll(organizationId)

    suspend fun upsertDraftExpense(expense: DraftExpenseEntity) {
        database.draftExpenseDao().upsert(expense)
    }

    suspend fun markDraftExpensePosted(organizationId: String, id: String) {
        database.draftExpenseDao().updateStatus(organizationId, id, "POSTED")
    }

    suspend fun deleteDraftExpense(organizationId: String, id: String) {
        database.draftExpenseDao().deleteById(organizationId, id)
    }

    fun observeCachedQuotations(organizationId: String): Flow<List<CachedQuotationEntity>> =
        database.cachedQuotationDao().observeAll(organizationId)

    suspend fun cacheQuotations(items: List<CachedQuotationEntity>) {
        if (items.isNotEmpty()) {
            database.cachedQuotationDao().upsertAll(items)
        }
    }

    fun observePendingOutboxCount(organizationId: String): Flow<Int> =
        database.syncOutboxDao().observePendingCount(organizationId)

    fun observeAllOutbox(organizationId: String): Flow<List<SyncOutboxEntity>> =
        database.syncOutboxDao().observeAll(organizationId)

    fun observePendingConflicts(organizationId: String) =
        database.syncConflictDao().observePendingConflicts(organizationId)

    fun observeMediaQueue(organizationId: String): Flow<List<MediaUploadQueueEntity>> =
        database.mediaUploadQueueDao().observeAll(organizationId)

    fun observeSyncCheckpoint(organizationId: String) =
        database.syncCheckpointDao().observeCheckpoint("$organizationId:delta")

    suspend fun retryOutboxOperationNow(operationId: String) {
        database.syncOutboxDao().resetRetryNow(operationId)
    }

    suspend fun clearAppliedOutbox(organizationId: String): Int =
        database.syncOutboxDao().deleteApplied(organizationId)

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
