package com.vnexsolar.app

import android.graphics.Color as AndroidColor
import android.os.Bundle
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.fragment.app.FragmentActivity
import androidx.hilt.navigation.compose.hiltViewModel
import com.vnexsolar.app.core.designsystem.VNexTheme
import com.vnexsolar.app.core.navigation.VNexNavHost
import com.vnexsolar.app.core.preferences.AppPreferences
import com.vnexsolar.app.core.security.BiometricHelper
import com.vnexsolar.app.core.security.UserRole
import com.vnexsolar.app.core.sync.NetworkMonitor
import com.vnexsolar.app.core.sync.OfflineRepository
import com.vnexsolar.app.core.sync.SyncWorker
import com.vnexsolar.app.feature.auth.AuthViewModel
import com.vnexsolar.app.feature.auth.BiometricLockScreen
import com.vnexsolar.app.feature.auth.LoginScreen
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.launch

@AndroidEntryPoint
class MainActivity : FragmentActivity() {

    @Inject
    lateinit var appPreferences: AppPreferences

    @Inject
    lateinit var biometricHelper: BiometricHelper

    @Inject
    lateinit var networkMonitor: NetworkMonitor

    @Inject
    lateinit var offlineRepository: OfflineRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val isDarkMode by appPreferences.darkThemeFlow.collectAsState(initial = false)
            val isOnline by networkMonitor.isOnlineFlow.collectAsState(initial = true)
            val scope = rememberCoroutineScope()
            val authViewModel: AuthViewModel = hiltViewModel()
            val activeSession by authViewModel.activeSession.collectAsState()
            val biometricLockEnabled by authViewModel.biometricLockEnabled.collectAsState()
            val isBiometricUnlocked by authViewModel.isBiometricUnlocked.collectAsState()
            val canUseBiometrics = remember { biometricHelper.canAuthenticate(this) }
            var biometricError by remember { mutableStateOf<String?>(null) }

            LaunchedEffect(isDarkMode) {
                val barStyle = if (isDarkMode) {
                    SystemBarStyle.dark(AndroidColor.TRANSPARENT)
                } else {
                    SystemBarStyle.light(AndroidColor.TRANSPARENT, AndroidColor.TRANSPARENT)
                }
                enableEdgeToEdge(
                    statusBarStyle = barStyle,
                    navigationBarStyle = barStyle,
                )
            }

            val toggleTheme: () -> Unit = {
                scope.launch { appPreferences.setDarkTheme(!isDarkMode) }
            }

            VNexTheme(darkTheme = isDarkMode) {
                val session = activeSession
                when {
                    session == null -> {
                        LoginScreen(
                            viewModel = authViewModel,
                            isDarkTheme = isDarkMode,
                            onToggleTheme = toggleTheme,
                        )
                    }

                    biometricLockEnabled && canUseBiometrics && !isBiometricUnlocked -> {
                        val triggerPrompt = {
                            biometricError = null
                            biometricHelper.authenticate(
                                activity = this,
                                onSuccess = { authViewModel.markBiometricUnlocked() },
                                onError = { msg -> biometricError = msg },
                            )
                        }

                        LaunchedEffect(session.sessionId) {
                            triggerPrompt()
                        }

                        BiometricLockScreen(
                            organizationName = session.organizationName,
                            userName = session.userFullName,
                            errorMessage = biometricError,
                            onUnlockClick = triggerPrompt,
                            onSignOutClick = { authViewModel.signOut() },
                        )
                    }

                    else -> {
                        val pendingOutboxCount by remember(session.organizationId) {
                            offlineRepository.observePendingOutboxCount(session.organizationId)
                        }.collectAsState(initial = 0)

                        LaunchedEffect(session.organizationId) {
                            offlineRepository.recoverAfterProcessTermination()
                            val deviceId = appPreferences.getOrCreateDeviceId()
                            SyncWorker.schedulePeriodicSync(this@MainActivity, session.organizationId, deviceId)
                        }

                        LaunchedEffect(session.organizationId, isOnline) {
                            if (isOnline && pendingOutboxCount > 0) {
                                val deviceId = appPreferences.getOrCreateDeviceId()
                                SyncWorker.enqueueOneTime(this@MainActivity, session.organizationId, deviceId)
                            }
                        }

                        VNexNavHost(
                            appPreferences = appPreferences,
                            organizationName = session.organizationName,
                            userEmail = session.userEmail,
                            userFullName = session.userFullName,
                            activeRole = UserRole.fromApi(session.role),
                            pendingOutboxCount = pendingOutboxCount,
                            isOnline = isOnline,
                            isDarkTheme = isDarkMode,
                            canUseBiometrics = canUseBiometrics,
                            onToggleTheme = toggleTheme,
                            onSignOut = { authViewModel.signOut() },
                        )
                    }
                }
            }
        }
    }
}
