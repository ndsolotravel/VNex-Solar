package com.vnexsolar.app.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vnexsolar.app.core.network.AuthApiService
import com.vnexsolar.app.core.network.LoginRequestDto
import com.vnexsolar.app.core.preferences.AppPreferences
import com.vnexsolar.app.core.security.SessionVault
import com.vnexsolar.app.core.security.VaultSession
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val organizationSlug: String = "",
    val serverUrl: String = "",
    val showServerConfig: Boolean = false,
    val isLoading: Boolean = false,
    val errorMessage: String? = null,
)

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val authApiService: AuthApiService,
    private val sessionVault: SessionVault,
    private val appPreferences: AppPreferences,
) : ViewModel() {

    val activeSession: StateFlow<VaultSession?> = sessionVault.sessionFlow
    val biometricLockEnabled: StateFlow<Boolean> = appPreferences.biometricLockEnabledFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    private val _isBiometricUnlocked = MutableStateFlow(false)
    val isBiometricUnlocked: StateFlow<Boolean> = _isBiometricUnlocked.asStateFlow()

    init {
        viewModelScope.launch {
            val savedUrl = appPreferences.getApiBaseUrl()
            _uiState.update { it.copy(serverUrl = savedUrl) }
        }
    }

    fun updateEmail(value: String) {
        _uiState.update { it.copy(email = value, errorMessage = null) }
    }

    fun updatePassword(value: String) {
        _uiState.update { it.copy(password = value, errorMessage = null) }
    }

    fun updateOrganizationSlug(value: String) {
        _uiState.update { it.copy(organizationSlug = value, errorMessage = null) }
    }

    fun updateServerUrl(value: String) {
        _uiState.update { it.copy(serverUrl = value, errorMessage = null) }
    }

    fun toggleServerConfig() {
        _uiState.update { it.copy(showServerConfig = !it.showServerConfig) }
    }

    fun markBiometricUnlocked() {
        _isBiometricUnlocked.value = true
    }

    fun signIn() {
        val state = _uiState.value
        val email = state.email.trim()
        val password = state.password
        if (email.isBlank() || !email.contains("@")) {
            _uiState.update { it.copy(errorMessage = "Enter a valid work email address") }
            return
        }
        if (password.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Password is required") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }
            try {
                if (state.serverUrl.isNotBlank()) {
                    appPreferences.setApiBaseUrl(state.serverUrl)
                }
                val deviceId = appPreferences.getOrCreateDeviceId()
                val res = authApiService.login(
                    LoginRequestDto(
                        email = email,
                        password = password,
                        organizationSlug = state.organizationSlug.trim().ifBlank { null },
                        deviceId = deviceId,
                    ),
                )
                val vaultSession = VaultSession(
                    accessToken = res.accessToken,
                    refreshToken = res.refreshToken,
                    sessionId = res.sessionId,
                    organizationId = res.organization.id,
                    organizationName = res.organization.displayName,
                    userId = res.user.id,
                    userEmail = res.user.email,
                    userFullName = res.user.fullName,
                    role = res.role,
                    defaultCurrency = res.organization.defaultCurrency,
                )
                sessionVault.saveSession(vaultSession)
                appPreferences.setSessionMetadata(
                    organizationId = res.organization.id,
                    organizationName = res.organization.displayName,
                    userEmail = res.user.email,
                    userFullName = res.user.fullName,
                    userRole = res.role,
                )
                appPreferences.setSelectedCurrency(res.organization.defaultCurrency)
                _isBiometricUnlocked.value = true
                _uiState.update { it.copy(isLoading = false, password = "", errorMessage = null) }
            } catch (ex: Exception) {
                val message = when {
                    ex.message?.contains("401") == true -> "Invalid email or password"
                    ex.message?.contains("429") == true -> "Account temporarily locked due to failed attempts"
                    ex.message?.contains("403") == true -> "User does not belong to the requested organization"
                    else -> ex.message ?: "Unable to connect to VNex Solar server"
                }
                _uiState.update { it.copy(isLoading = false, errorMessage = message) }
            }
        }
    }

    fun signOut() {
        viewModelScope.launch {
            try {
                authApiService.logout()
            } catch (_ex: Exception) {
                // Proceed with local vault cleanup even while offline
            }
            sessionVault.clearSession()
            appPreferences.clearSessionMetadata()
            _isBiometricUnlocked.value = false
        }
    }
}
