package com.vnexsolar.app.core.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import com.vnexsolar.app.core.notifications.VNexNotificationHelper
import com.vnexsolar.app.core.preferences.AppPreferences
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.flow.first

@HiltWorker
class SyncWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val syncEngine: SyncEngine,
    private val notificationHelper: VNexNotificationHelper,
    private val appPreferences: AppPreferences,
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val organizationId = inputData.getString(KEY_ORG_ID) ?: return Result.failure()
        val deviceId = inputData.getString(KEY_DEVICE_ID) ?: return Result.failure()

        val result = syncEngine.runSyncCycle(organizationId = organizationId, deviceId = deviceId)
        if (result.conflictCount > 0) {
            val alertsEnabled = runCatching { appPreferences.notificationsEnabledFlow.first() }.getOrDefault(true)
            if (alertsEnabled) {
                notificationHelper.notifySyncConflicts(
                    conflictCount = result.conflictCount,
                    appliedCount = result.appliedCount,
                )
            }
        }
        return if (result.succeeded) Result.success() else Result.retry()
    }

    companion object {
        const val KEY_ORG_ID = "org_id"
        const val KEY_DEVICE_ID = "device_id"
        private const val UNIQUE_SYNC_WORK = "vnex_outbox_one_time_sync"
        private const val UNIQUE_PERIODIC_SYNC_WORK = "vnex_periodic_outbox_sync"

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

        fun schedulePeriodicSync(context: Context, organizationId: String, deviceId: String) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val periodicRequest = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .setInputData(workDataOf(KEY_ORG_ID to organizationId, KEY_DEVICE_ID to deviceId))
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 15, TimeUnit.SECONDS)
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                "$UNIQUE_PERIODIC_SYNC_WORK:$organizationId",
                ExistingPeriodicWorkPolicy.KEEP,
                periodicRequest,
            )
        }
    }
}
