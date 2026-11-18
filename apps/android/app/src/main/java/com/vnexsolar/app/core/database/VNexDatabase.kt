package com.vnexsolar.app.core.database

import androidx.room.Database
import androidx.room.RoomDatabase
import com.vnexsolar.app.core.database.dao.CachedEquipmentDao
import com.vnexsolar.app.core.database.dao.CustomerDao
import com.vnexsolar.app.core.database.dao.MediaUploadQueueDao
import com.vnexsolar.app.core.database.dao.SiteSurveyDao
import com.vnexsolar.app.core.database.dao.SyncCheckpointDao
import com.vnexsolar.app.core.database.dao.SyncConflictDao
import com.vnexsolar.app.core.database.dao.SyncOutboxDao
import com.vnexsolar.app.core.database.entity.CachedEquipmentEntity
import com.vnexsolar.app.core.database.entity.CustomerEntity
import com.vnexsolar.app.core.database.entity.MediaUploadQueueEntity
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
    ],
    version = 1,
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
}
