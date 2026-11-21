package com.vnexsolar.app.core.database

import androidx.room.Database
import androidx.room.RoomDatabase
import com.vnexsolar.app.core.database.dao.CachedEquipmentDao
import com.vnexsolar.app.core.database.dao.CachedQuotationDao
import com.vnexsolar.app.core.database.dao.CustomerDao
import com.vnexsolar.app.core.database.dao.DashboardSnapshotDao
import com.vnexsolar.app.core.database.dao.DraftExpenseDao
import com.vnexsolar.app.core.database.dao.MediaUploadQueueDao
import com.vnexsolar.app.core.database.dao.ProjectDao
import com.vnexsolar.app.core.database.dao.SiteDao
import com.vnexsolar.app.core.database.dao.SiteSurveyDao
import com.vnexsolar.app.core.database.dao.SyncCheckpointDao
import com.vnexsolar.app.core.database.dao.SyncConflictDao
import com.vnexsolar.app.core.database.dao.SyncOutboxDao
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

@Database(
    entities = [
        CustomerEntity::class,
        SiteSurveyEntity::class,
        CachedEquipmentEntity::class,
        SyncOutboxEntity::class,
        MediaUploadQueueEntity::class,
        SyncConflictEntity::class,
        SyncCheckpointEntity::class,
        ProjectEntity::class,
        SiteEntity::class,
        DashboardSnapshotEntity::class,
        DraftExpenseEntity::class,
        CachedQuotationEntity::class,
    ],
    version = 3,
    exportSchema = true,
)
abstract class VNexDatabase : RoomDatabase() {
    abstract fun customerDao(): CustomerDao
    abstract fun siteSurveyDao(): SiteSurveyDao
    abstract fun cachedEquipmentDao(): CachedEquipmentDao
    abstract fun syncOutboxDao(): SyncOutboxDao
    abstract fun mediaUploadQueueDao(): MediaUploadQueueDao
    abstract fun syncConflictDao(): SyncConflictDao
    abstract fun syncCheckpointDao(): SyncCheckpointDao
    abstract fun projectDao(): ProjectDao
    abstract fun siteDao(): SiteDao
    abstract fun dashboardSnapshotDao(): DashboardSnapshotDao
    abstract fun draftExpenseDao(): DraftExpenseDao
    abstract fun cachedQuotationDao(): CachedQuotationDao
}
