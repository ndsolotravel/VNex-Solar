package com.vnexsolar.app.core.di

import android.content.Context
import androidx.room.Room
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.vnexsolar.app.core.database.VNexDatabase
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
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

val MIGRATION_1_2 = object : Migration(1, 2) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS `projects` (
                `id` TEXT NOT NULL,
                `organizationId` TEXT NOT NULL,
                `customerId` TEXT NOT NULL,
                `siteId` TEXT NOT NULL,
                `projectCode` TEXT NOT NULL,
                `title` TEXT NOT NULL,
                `systemType` TEXT NOT NULL,
                `targetCapacityKwp` REAL,
                `currentStage` TEXT NOT NULL,
                `status` TEXT NOT NULL,
                `currency` TEXT NOT NULL,
                `rowVersion` INTEGER NOT NULL,
                `syncState` TEXT NOT NULL,
                `updatedAtEpochMs` INTEGER NOT NULL,
                PRIMARY KEY(`id`)
            )
            """.trimIndent(),
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS `index_projects_organizationId_updatedAtEpochMs` ON `projects` (`organizationId`, `updatedAtEpochMs`)",
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS `sites` (
                `id` TEXT NOT NULL,
                `organizationId` TEXT NOT NULL,
                `customerId` TEXT NOT NULL,
                `siteName` TEXT NOT NULL,
                `addressLine` TEXT NOT NULL,
                `city` TEXT NOT NULL,
                `countryCode` TEXT NOT NULL,
                `utilityProvider` TEXT,
                `meterReference` TEXT,
                `connectionPhase` TEXT NOT NULL,
                `rowVersion` INTEGER NOT NULL,
                `syncState` TEXT NOT NULL,
                `createdAtEpochMs` INTEGER NOT NULL,
                PRIMARY KEY(`id`)
            )
            """.trimIndent(),
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS `index_sites_organizationId_customerId` ON `sites` (`organizationId`, `customerId`)",
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS `dashboard_snapshots` (
                `snapshotKey` TEXT NOT NULL,
                `organizationId` TEXT NOT NULL,
                `rangeKey` TEXT NOT NULL,
                `payloadJson` TEXT NOT NULL,
                `updatedAtEpochMs` INTEGER NOT NULL,
                PRIMARY KEY(`snapshotKey`)
            )
            """.trimIndent(),
        )
    }
}

val MIGRATION_2_3 = object : Migration(2, 3) {
    override fun migrate(db: SupportSQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS `draft_expenses` (
                `id` TEXT NOT NULL,
                `organizationId` TEXT NOT NULL,
                `category` TEXT NOT NULL,
                `description` TEXT NOT NULL,
                `amountMinor` INTEGER NOT NULL,
                `currency` TEXT NOT NULL,
                `paymentMethod` TEXT NOT NULL,
                `referenceNo` TEXT,
                `status` TEXT NOT NULL,
                `createdAtEpochMs` INTEGER NOT NULL,
                PRIMARY KEY(`id`)
            )
            """.trimIndent(),
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS `index_draft_expenses_organizationId_createdAtEpochMs` ON `draft_expenses` (`organizationId`, `createdAtEpochMs`)",
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS `cached_quotations` (
                `id` TEXT NOT NULL,
                `organizationId` TEXT NOT NULL,
                `projectId` TEXT NOT NULL,
                `customerId` TEXT NOT NULL,
                `quotationNumber` TEXT NOT NULL,
                `title` TEXT NOT NULL,
                `status` TEXT NOT NULL,
                `currentRevisionNumber` INTEGER NOT NULL,
                `currency` TEXT NOT NULL,
                `totalAmountMinor` INTEGER NOT NULL,
                `payloadJson` TEXT NOT NULL,
                `updatedAtEpochMs` INTEGER NOT NULL,
                PRIMARY KEY(`id`)
            )
            """.trimIndent(),
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS `index_cached_quotations_organizationId_updatedAtEpochMs` ON `cached_quotations` (`organizationId`, `updatedAtEpochMs`)",
        )
    }
}

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideVNexDatabase(@ApplicationContext context: Context): VNexDatabase {
        val builder = Room.databaseBuilder(context, VNexDatabase::class.java, "vnex_solar_offline.db")
            .addMigrations(MIGRATION_1_2, MIGRATION_2_3)
        if (com.vnexsolar.app.BuildConfig.DEBUG) {
            builder.fallbackToDestructiveMigrationOnDowngrade()
        }
        return builder.build()
    }

    @Provides
    fun provideCustomerDao(db: VNexDatabase): CustomerDao = db.customerDao()

    @Provides
    fun provideSiteSurveyDao(db: VNexDatabase): SiteSurveyDao = db.siteSurveyDao()

    @Provides
    fun provideCachedEquipmentDao(db: VNexDatabase): CachedEquipmentDao = db.cachedEquipmentDao()

    @Provides
    fun provideSyncOutboxDao(db: VNexDatabase): SyncOutboxDao = db.syncOutboxDao()

    @Provides
    fun provideMediaUploadQueueDao(db: VNexDatabase): MediaUploadQueueDao = db.mediaUploadQueueDao()

    @Provides
    fun provideSyncConflictDao(db: VNexDatabase): SyncConflictDao = db.syncConflictDao()

    @Provides
    fun provideSyncCheckpointDao(db: VNexDatabase): SyncCheckpointDao = db.syncCheckpointDao()

    @Provides
    fun provideProjectDao(db: VNexDatabase): ProjectDao = db.projectDao()

    @Provides
    fun provideSiteDao(db: VNexDatabase): SiteDao = db.siteDao()

    @Provides
    fun provideDashboardSnapshotDao(db: VNexDatabase): DashboardSnapshotDao = db.dashboardSnapshotDao()

    @Provides
    fun provideDraftExpenseDao(db: VNexDatabase): DraftExpenseDao = db.draftExpenseDao()

    @Provides
    fun provideCachedQuotationDao(db: VNexDatabase): CachedQuotationDao = db.cachedQuotationDao()
}
