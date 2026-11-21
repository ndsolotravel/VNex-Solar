package com.vnexsolar.app.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.vnexsolar.app.core.database.entity.CachedEquipmentEntity
import com.vnexsolar.app.core.database.entity.CachedQuotationEntity
import com.vnexsolar.app.core.database.entity.CustomerEntity
import com.vnexsolar.app.core.database.entity.DashboardSnapshotEntity
import com.vnexsolar.app.core.database.entity.DraftExpenseEntity
import com.vnexsolar.app.core.database.entity.MediaUploadQueueEntity
import com.vnexsolar.app.core.database.entity.ProjectEntity
import com.vnexsolar.app.core.database.entity.SiteEntity
import com.vnexsolar.app.core.database.entity.SiteSurveyEntity
import com.vnexsolar.app.core.database.entity.SyncCheckpointEntity
import com.vnexsolar.app.core.database.entity.SyncConflictEntity
import com.vnexsolar.app.core.database.entity.SyncOutboxEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface CustomerDao {
    @Query("SELECT * FROM customers WHERE organizationId = :orgId ORDER BY updatedAtEpochMs DESC")
    fun observeAll(orgId: String): Flow<List<CustomerEntity>>

    @Query("SELECT * FROM customers WHERE id = :id AND organizationId = :orgId LIMIT 1")
    suspend fun getById(orgId: String, id: String): CustomerEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: CustomerEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<CustomerEntity>)

    @Query("UPDATE customers SET rowVersion = :newVersion, syncState = :syncState WHERE id = :id AND organizationId = :orgId")
    suspend fun markSynced(orgId: String, id: String, newVersion: Int, syncState: String = "SYNCED")
}

@Dao
interface SiteSurveyDao {
    @Query("SELECT * FROM site_surveys WHERE organizationId = :orgId ORDER BY updatedAtEpochMs DESC")
    fun observeAll(orgId: String): Flow<List<SiteSurveyEntity>>

    @Query("SELECT * FROM site_surveys WHERE id = :id AND organizationId = :orgId LIMIT 1")
    suspend fun getById(orgId: String, id: String): SiteSurveyEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: SiteSurveyEntity)
}

@Dao
interface CachedEquipmentDao {
    @Query("SELECT * FROM cached_equipment WHERE organizationId = :orgId ORDER BY modelName ASC")
    fun observeCatalog(orgId: String): Flow<List<CachedEquipmentEntity>>

    @Query("SELECT * FROM cached_equipment WHERE organizationId = :orgId AND category = :category ORDER BY modelName ASC")
    fun observeCatalogByCategory(orgId: String, category: String): Flow<List<CachedEquipmentEntity>>

    @Query("SELECT * FROM cached_equipment WHERE organizationId = :orgId AND sku = :sku LIMIT 1")
    suspend fun findBySku(orgId: String, sku: String): CachedEquipmentEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<CachedEquipmentEntity>)
}

@Dao
interface SyncOutboxDao {
    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun enqueue(operation: SyncOutboxEntity)

    @Query("SELECT * FROM sync_outbox WHERE organizationId = :orgId ORDER BY createdAtEpochMs DESC")
    fun observeAll(orgId: String): Flow<List<SyncOutboxEntity>>

    @Query(
        """
        SELECT * FROM sync_outbox
        WHERE organizationId = :orgId
          AND status IN ('PENDING', 'FAILED_RETRYABLE')
          AND nextRetryAtEpochMs <= :nowEpochMs
        ORDER BY createdAtEpochMs ASC
        LIMIT :limit
        """,
    )
    suspend fun fetchDispatchable(orgId: String, nowEpochMs: Long, limit: Int = 25): List<SyncOutboxEntity>

    @Query("SELECT COUNT(*) FROM sync_outbox WHERE organizationId = :orgId AND status IN ('PENDING', 'IN_FLIGHT', 'FAILED_RETRYABLE')")
    fun observePendingCount(orgId: String): Flow<Int>

    @Query("UPDATE sync_outbox SET status = 'IN_FLIGHT' WHERE syncOperationId IN (:operationIds)")
    suspend fun markInFlight(operationIds: List<String>)

    // Process-death recovery: revert interrupted IN_FLIGHT operations safely back to PENDING
    @Query("UPDATE sync_outbox SET status = 'PENDING' WHERE status = 'IN_FLIGHT'")
    suspend fun recoverInterruptedInFlightOps(): Int

    @Query("UPDATE sync_outbox SET status = 'APPLIED', lastError = NULL WHERE syncOperationId = :operationId")
    suspend fun markApplied(operationId: String)

    @Query("UPDATE sync_outbox SET status = :status, lastError = :error WHERE syncOperationId = :operationId")
    suspend fun markTerminalStatus(operationId: String, status: String, error: String?)

    @Query("UPDATE sync_outbox SET status = 'PENDING', nextRetryAtEpochMs = 0, lastError = NULL WHERE syncOperationId = :operationId")
    suspend fun resetRetryNow(operationId: String)

    @Query("DELETE FROM sync_outbox WHERE organizationId = :orgId AND status = 'APPLIED'")
    suspend fun deleteApplied(orgId: String): Int

    @Query(
        """
        UPDATE sync_outbox
        SET status = 'FAILED_RETRYABLE',
            retryCount = retryCount + 1,
            nextRetryAtEpochMs = :nextRetryAtEpochMs,
            lastError = :error
        WHERE syncOperationId = :operationId
        """,
    )
    suspend fun markRetryableFailure(operationId: String, nextRetryAtEpochMs: Long, error: String)
}

@Dao
interface MediaUploadQueueDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun enqueue(item: MediaUploadQueueEntity)

    @Query("SELECT * FROM media_upload_queue WHERE organizationId = :orgId ORDER BY createdAtEpochMs DESC")
    fun observeAll(orgId: String): Flow<List<MediaUploadQueueEntity>>

    @Query("SELECT * FROM media_upload_queue WHERE organizationId = :orgId AND status IN ('PENDING', 'FAILED_RETRYABLE') ORDER BY createdAtEpochMs ASC LIMIT :limit")
    suspend fun fetchPending(orgId: String, limit: Int = 10): List<MediaUploadQueueEntity>

    @Query("UPDATE media_upload_queue SET status = 'UPLOADING' WHERE mediaId = :mediaId")
    suspend fun markUploading(mediaId: String)

    @Query("UPDATE media_upload_queue SET status = 'PENDING' WHERE status = 'UPLOADING'")
    suspend fun recoverInterruptedUploads(): Int

    @Query("UPDATE media_upload_queue SET status = 'VERIFIED', remoteAttachmentId = :remoteId, lastError = NULL WHERE mediaId = :mediaId")
    suspend fun markVerified(mediaId: String, remoteId: String)

    @Query("UPDATE media_upload_queue SET status = 'FAILED_RETRYABLE', retryCount = retryCount + 1, lastError = :error WHERE mediaId = :mediaId")
    suspend fun markRetryableFailure(mediaId: String, error: String)
}

@Dao
interface SyncConflictDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(conflict: SyncConflictEntity)

    @Query("SELECT * FROM sync_conflicts WHERE organizationId = :orgId AND resolutionStatus = 'PENDING' ORDER BY createdAtEpochMs DESC")
    fun observePendingConflicts(orgId: String): Flow<List<SyncConflictEntity>>

    @Query("UPDATE sync_conflicts SET resolutionStatus = :resolution WHERE conflictId = :conflictId")
    suspend fun markResolved(conflictId: String, resolution: String)
}

@Dao
interface SyncCheckpointDao {
    @Query("SELECT * FROM sync_checkpoints WHERE checkpointKey = :key LIMIT 1")
    suspend fun getCheckpoint(key: String): SyncCheckpointEntity?

    @Query("SELECT * FROM sync_checkpoints WHERE checkpointKey = :key LIMIT 1")
    fun observeCheckpoint(key: String): Flow<SyncCheckpointEntity?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertCheckpoint(checkpoint: SyncCheckpointEntity)
}

@Dao
interface ProjectDao {
    @Query("SELECT * FROM projects WHERE organizationId = :orgId ORDER BY updatedAtEpochMs DESC")
    fun observeAll(orgId: String): Flow<List<ProjectEntity>>

    @Query("SELECT * FROM projects WHERE organizationId = :orgId AND customerId = :customerId ORDER BY updatedAtEpochMs DESC")
    fun observeByCustomer(orgId: String, customerId: String): Flow<List<ProjectEntity>>

    @Query("SELECT * FROM projects WHERE id = :id AND organizationId = :orgId LIMIT 1")
    suspend fun getById(orgId: String, id: String): ProjectEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: ProjectEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<ProjectEntity>)
}

@Dao
interface SiteDao {
    @Query("SELECT * FROM sites WHERE organizationId = :orgId AND customerId = :customerId ORDER BY createdAtEpochMs DESC")
    fun observeForCustomer(orgId: String, customerId: String): Flow<List<SiteEntity>>

    @Query("SELECT * FROM sites WHERE organizationId = :orgId ORDER BY createdAtEpochMs DESC")
    fun observeAll(orgId: String): Flow<List<SiteEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: SiteEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<SiteEntity>)
}

@Dao
interface DashboardSnapshotDao {
    @Query("SELECT * FROM dashboard_snapshots WHERE snapshotKey = :snapshotKey LIMIT 1")
    suspend fun getSnapshot(snapshotKey: String): DashboardSnapshotEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: DashboardSnapshotEntity)
}

@Dao
interface DraftExpenseDao {
    @Query("SELECT * FROM draft_expenses WHERE organizationId = :orgId ORDER BY createdAtEpochMs DESC")
    fun observeAll(orgId: String): Flow<List<DraftExpenseEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: DraftExpenseEntity)

    @Query("UPDATE draft_expenses SET status = :status WHERE id = :id AND organizationId = :orgId")
    suspend fun updateStatus(orgId: String, id: String, status: String)

    @Query("DELETE FROM draft_expenses WHERE id = :id AND organizationId = :orgId")
    suspend fun deleteById(orgId: String, id: String)
}

@Dao
interface CachedQuotationDao {
    @Query("SELECT * FROM cached_quotations WHERE organizationId = :orgId ORDER BY updatedAtEpochMs DESC")
    fun observeAll(orgId: String): Flow<List<CachedQuotationEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<CachedQuotationEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(item: CachedQuotationEntity)
}
