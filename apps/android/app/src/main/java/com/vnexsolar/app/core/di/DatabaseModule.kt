package com.vnexsolar.app.core.di

import android.content.Context
import androidx.room.Room
import com.vnexsolar.app.core.database.VNexDatabase
import com.vnexsolar.app.core.database.dao.CustomerDao
import com.vnexsolar.app.core.database.dao.MediaUploadQueueDao
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

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideVNexDatabase(@ApplicationContext context: Context): VNexDatabase =
        Room.databaseBuilder(context, VNexDatabase::class.java, "vnex_solar_offline.db")
            .fallbackToDestructiveMigrationOnDowngrade()
            .build()

    @Provides
    fun provideCustomerDao(db: VNexDatabase): CustomerDao = db.customerDao()

    @Provides
    fun provideSiteSurveyDao(db: VNexDatabase): SiteSurveyDao = db.siteSurveyDao()

    @Provides
    fun provideSyncOutboxDao(db: VNexDatabase): SyncOutboxDao = db.syncOutboxDao()

    @Provides
    fun provideMediaUploadQueueDao(db: VNexDatabase): MediaUploadQueueDao = db.mediaUploadQueueDao()

    @Provides
    fun provideSyncConflictDao(db: VNexDatabase): SyncConflictDao = db.syncConflictDao()

    @Provides
    fun provideSyncCheckpointDao(db: VNexDatabase): SyncCheckpointDao = db.syncCheckpointDao()
}
