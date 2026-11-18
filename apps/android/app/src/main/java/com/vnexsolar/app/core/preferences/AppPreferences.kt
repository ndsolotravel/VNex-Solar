package com.vnexsolar.app.core.preferences

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.vnexDataStore by preferencesDataStore(name = "vnex_preferences")

@Singleton
class AppPreferences @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private object Keys {
        val DARK_THEME = booleanPreferencesKey("dark_theme")
        val ACTIVE_ORG_ID = stringPreferencesKey("active_org_id")
    }

    val darkThemeFlow: Flow<Boolean> = context.vnexDataStore.data.map { prefs ->
        prefs[Keys.DARK_THEME] ?: false
    }

    val activeOrgIdFlow: Flow<String?> = context.vnexDataStore.data.map { prefs ->
        prefs[Keys.ACTIVE_ORG_ID]
    }

    suspend fun setDarkTheme(enabled: Boolean) {
        context.vnexDataStore.edit { prefs ->
            prefs[Keys.DARK_THEME] = enabled
        }
    }
}
