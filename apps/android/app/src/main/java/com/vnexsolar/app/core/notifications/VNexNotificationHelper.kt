package com.vnexsolar.app.core.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.vnexsolar.app.MainActivity
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class VNexNotificationHelper @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    fun ensureChannels() {
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return

        val syncChannel = NotificationChannel(
            CHANNEL_SYNC_ALERTS,
            "Offline Sync & Conflicts",
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = "Alerts when offline records require conflict resolution or sync attention."
        }

        val fieldChannel = NotificationChannel(
            CHANNEL_FIELD_REMINDERS,
            "Site Visits & Maintenance",
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = "Notifications for scheduled solar installations, safety inspections, and preventive O&M."
        }

        manager.createNotificationChannel(syncChannel)
        manager.createNotificationChannel(fieldChannel)
    }

    fun hasNotificationPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS,
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    fun notifySyncConflicts(conflictCount: Int, appliedCount: Int) {
        if (conflictCount <= 0 || !hasNotificationPermission()) return
        ensureChannels()

        val launchIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            NOTIFICATION_ID_SYNC_CONFLICT,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val body = if (appliedCount > 0) {
            "$appliedCount change(s) synced; $conflictCount conflict(s) require manual review."
        } else {
            "$conflictCount offline record conflict(s) detected. Open Sync Queue to resolve."
        }

        val notification = NotificationCompat.Builder(context, CHANNEL_SYNC_ALERTS)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("VNex Solar Sync Attention")
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        runCatching {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID_SYNC_CONFLICT, notification)
        }
    }

    fun notifyFieldReminder(title: String, message: String) {
        if (!hasNotificationPermission()) return
        ensureChannels()

        val launchIntent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            NOTIFICATION_ID_FIELD_REMINDER,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_FIELD_REMINDERS)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        runCatching {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID_FIELD_REMINDER, notification)
        }
    }

    companion object {
        const val CHANNEL_SYNC_ALERTS = "vnex_sync_alerts"
        const val CHANNEL_FIELD_REMINDERS = "vnex_field_reminders"
        private const val NOTIFICATION_ID_SYNC_CONFLICT = 7101
        private const val NOTIFICATION_ID_FIELD_REMINDER = 7102
    }
}
