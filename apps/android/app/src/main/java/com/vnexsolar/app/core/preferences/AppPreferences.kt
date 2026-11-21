package com.vnexsolar.app.core.preferences

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.vnexsolar.app.BuildConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.vnexDataStore by preferencesDataStore(name = "vnex_preferences")

@Singleton
class AppPreferences @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private object Keys {
        val DARK_THEME = booleanPreferencesKey("dark_theme")
        val BIOMETRIC_LOCK = booleanPreferencesKey("biometric_lock")
        val NOTIFICATIONS_ENABLED = booleanPreferencesKey("notifications_enabled")
        val API_BASE_URL = stringPreferencesKey("api_base_url")
        val SELECTED_CURRENCY = stringPreferencesKey("selected_currency")
        val DEVICE_ID = stringPreferencesKey("device_id")
        val ACTIVE_ORG_ID = stringPreferencesKey("active_org_id")
        val ACTIVE_ORG_NAME = stringPreferencesKey("active_org_name")
        val ACTIVE_USER_EMAIL = stringPreferencesKey("active_user_email")
        val ACTIVE_USER_NAME = stringPreferencesKey("active_user_name")
        val ACTIVE_USER_ROLE = stringPreferencesKey("active_user_role")
    }

    val darkThemeFlow: Flow<Boolean> = context.vnexDataStore.data.map { prefs ->
        prefs[Keys.DARK_THEME] ?: false
    }

    val biometricLockEnabledFlow: Flow<Boolean> = context.vnexDataStore.data.map { prefs ->
        prefs[Keys.BIOMETRIC_LOCK] ?: false
    }

    val notificationsEnabledFlow: Flow<Boolean> = context.vnexDataStore.data.map { prefs ->
        prefs[Keys.NOTIFICATIONS_ENABLED] ?: true
    }

    val apiBaseUrlFlow: Flow<String> = context.vnexDataStore.data.map { prefs ->
        normalizeBaseUrl(prefs[Keys.API_BASE_URL] ?: BuildConfig.DEFAULT_API_BASE_URL)
    }

    val selectedCurrencyFlow: Flow<String> = context.vnexDataStore.data.map { prefs ->
        prefs[Keys.SELECTED_CURRENCY] ?: "PKR"
    }

    val activeOrgIdFlow: Flow<String?> = context.vnexDataStore.data.map { prefs ->
        prefs[Keys.ACTIVE_ORG_ID]
    }

    val activeOrgNameFlow: Flow<String?> = context.vnexDataStore.data.map { prefs ->
        prefs[Keys.ACTIVE_ORG_NAME]
    }

    val activeUserEmailFlow: Flow<String?> = context.vnexDataStore.data.map { prefs ->
        prefs[Keys.ACTIVE_USER_EMAIL]
    }

    val activeUserNameFlow: Flow<String?> = context.vnexDataStore.data.map { prefs ->
        prefs[Keys.ACTIVE_USER_NAME]
    }

    val activeUserRoleFlow: Flow<String?> = context.vnexDataStore.data.map { prefs ->
        prefs[Keys.ACTIVE_USER_ROLE]
    }

    suspend fun getApiBaseUrl(): String = apiBaseUrlFlow.first()

    suspend fun getOrCreateDeviceId(): String {
        val existing = context.vnexDataStore.data.first()[Keys.DEVICE_ID]
        if (!existing.isNullOrBlank()) return existing
        val created = "android-${UUID.randomUUID()}"
        context.vnexDataStore.edit { prefs ->
            prefs[Keys.DEVICE_ID] = created
        }
        return created
    }

    suspend fun setDarkTheme(enabled: Boolean) {
        context.vnexDataStore.edit { prefs ->
            prefs[Keys.DARK_THEME] = enabled
        }
    }

    suspend fun setBiometricLockEnabled(enabled: Boolean) {
        context.vnexDataStore.edit { prefs ->
            prefs[Keys.BIOMETRIC_LOCK] = enabled
        }
    }

    suspend fun setNotificationsEnabled(enabled: Boolean) {
        context.vnexDataStore.edit { prefs ->
            prefs[Keys.NOTIFICATIONS_ENABLED] = enabled
        }
    }

    suspend fun setApiBaseUrl(url: String) {
        context.vnexDataStore.edit { prefs ->
            prefs[Keys.API_BASE_URL] = normalizeBaseUrl(url)
        }
    }

    suspend fun setSelectedCurrency(currencyCode: String) {
        context.vnexDataStore.edit { prefs ->
            prefs[Keys.SELECTED_CURRENCY] = currencyCode
        }
    }

    suspend fun setSessionMetadata(
        organizationId: String,
        organizationName: String,
        userEmail: String,
        userFullName: String,
        userRole: String,
    ) {
        context.vnexDataStore.edit { prefs ->
            prefs[Keys.ACTIVE_ORG_ID] = organizationId
            prefs[Keys.ACTIVE_ORG_NAME] = organizationName
            prefs[Keys.ACTIVE_USER_EMAIL] = userEmail
            prefs[Keys.ACTIVE_USER_NAME] = userFullName
            prefs[Keys.ACTIVE_USER_ROLE] = userRole
        }
    }

    suspend fun clearSessionMetadata() {
        context.vnexDataStore.edit { prefs ->
            prefs.remove(Keys.ACTIVE_ORG_ID)
            prefs.remove(Keys.ACTIVE_ORG_NAME)
            prefs.remove(Keys.ACTIVE_USER_EMAIL)
            prefs.remove(Keys.ACTIVE_USER_NAME)
            prefs.remove(Keys.ACTIVE_USER_ROLE)
        }
    }

    companion object {
        fun normalizeBaseUrl(raw: String): String {
            val trimmed = raw.trim().ifEmpty { BuildConfig.DEFAULT_API_BASE_URL }
            return if (trimmed.endsWith("/")) trimmed else "$trimmed/"
        }
    }
}
