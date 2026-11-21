package com.vnexsolar.app.feature.settings

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.vnexsolar.app.BuildConfig
import com.vnexsolar.app.core.designsystem.VNexMetricRow
import com.vnexsolar.app.core.designsystem.VNexReadableContentBox
import com.vnexsolar.app.core.designsystem.VNexSurfaceCard
import com.vnexsolar.app.core.model.DomainConstants
import com.vnexsolar.app.core.network.ApiUrlValidator
import com.vnexsolar.app.core.preferences.AppPreferences
import com.vnexsolar.app.core.security.UserRole
import kotlinx.coroutines.launch

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsScreen(
    appPreferences: AppPreferences,
    organizationName: String,
    userEmail: String,
    userFullName: String,
    role: UserRole,
    isDarkTheme: Boolean,
    canUseBiometrics: Boolean,
    onToggleTheme: () -> Unit,
    onSignOut: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val selectedCurrency by appPreferences.selectedCurrencyFlow.collectAsState(initial = "PKR")
    val biometricEnabled by appPreferences.biometricLockEnabledFlow.collectAsState(initial = false)
    val notificationsEnabled by appPreferences.notificationsEnabledFlow.collectAsState(initial = true)
    val savedBaseUrl by appPreferences.apiBaseUrlFlow.collectAsState(initial = "")
    var editableBaseUrl by remember(savedBaseUrl) { mutableStateOf(savedBaseUrl) }
    var serverSavedMessage by remember { mutableStateOf<String?>(null) }
    var serverErrorMessage by remember { mutableStateOf<String?>(null) }

    val notificationPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
    ) { granted ->
        scope.launch { appPreferences.setNotificationsEnabled(granted) }
    }

    VNexReadableContentBox(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                text = "Settings",
                style = MaterialTheme.typography.headlineMedium,
            )

            VNexSurfaceCard {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = "Account & Organization",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(bottom = 6.dp),
                    )
                    VNexMetricRow(label = "Organization", value = organizationName.ifBlank { "-" })
                    VNexMetricRow(label = "User", value = userFullName.ifBlank { "-" })
                    VNexMetricRow(label = "Email", value = userEmail.ifBlank { "-" })
                    VNexMetricRow(label = "Role", value = role.label)
                    VNexMetricRow(label = "App Version", value = BuildConfig.VERSION_NAME, showDivider = false)
                }
            }

            VNexSurfaceCard {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(
                        text = "Display Currency",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        text = "Default PKR plus international solar EPC currencies.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        DomainConstants.SUPPORTED_CURRENCIES.forEach { currency ->
                            FilterChip(
                                selected = selectedCurrency == currency.code,
                                onClick = {
                                    scope.launch { appPreferences.setSelectedCurrency(currency.code) }
                                },
                                label = { Text("${currency.code} (${currency.symbol})") },
                            )
                        }
                    }
                }
            }

            VNexSurfaceCard {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(
                        text = "Appearance, Alerts & Security",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Dark Theme", style = MaterialTheme.typography.bodyMedium)
                            Text(
                                "High-contrast slate workspace for low-light rooms",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Switch(
                            checked = isDarkTheme,
                            onCheckedChange = { onToggleTheme() },
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Sync & Field Alerts", style = MaterialTheme.typography.bodyMedium)
                            Text(
                                "Notify when offline records need conflict resolution",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Switch(
                            checked = notificationsEnabled,
                            onCheckedChange = { enabled ->
                                if (enabled && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                                    notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                                } else {
                                    scope.launch { appPreferences.setNotificationsEnabled(enabled) }
                                }
                            },
                        )
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Biometric App Lock", style = MaterialTheme.typography.bodyMedium)
                            Text(
                                if (canUseBiometrics) {
                                    "Require fingerprint or device lock on reopen"
                                } else {
                                    "No enrolled biometric or device PIN detected"
                                },
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Switch(
                            checked = biometricEnabled,
                            enabled = canUseBiometrics || biometricEnabled,
                            onCheckedChange = { enabled ->
                                scope.launch { appPreferences.setBiometricLockEnabled(enabled) }
                            },
                        )
                    }
                }
            }

            VNexSurfaceCard {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(
                        text = "Backend Server Connection",
                        style = MaterialTheme.typography.titleMedium,
                    )
                    OutlinedTextField(
                        value = editableBaseUrl,
                        onValueChange = {
                            editableBaseUrl = it
                            serverSavedMessage = null
                            serverErrorMessage = null
                        },
                        label = { Text("API Base URL (HTTPS required in production)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    if (!serverErrorMessage.isNullOrBlank()) {
                        Text(
                            text = serverErrorMessage!!,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error,
                        )
                    }
                    if (!serverSavedMessage.isNullOrBlank()) {
                        Text(
                            text = serverSavedMessage!!,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.primary,
                        )
                    }
                    Button(
                        onClick = {
                            val validation = ApiUrlValidator.validate(
                                rawUrl = editableBaseUrl,
                                allowDebugCleartext = BuildConfig.DEBUG,
                            )
                            if (!validation.isValid || validation.normalizedUrl == null) {
                                serverErrorMessage = validation.errorMessage ?: "Invalid server URL."
                                serverSavedMessage = null
                            } else {
                                scope.launch {
                                    appPreferences.setApiBaseUrl(validation.normalizedUrl)
                                    editableBaseUrl = validation.normalizedUrl
                                    serverErrorMessage = null
                                    serverSavedMessage = "Server URL updated"
                                }
                            }
                        },
                    ) {
                        Text("Save Server URL")
                    }
                }
            }

            OutlinedButton(
                onClick = onSignOut,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Sign Out", color = MaterialTheme.colorScheme.error)
            }
        }
    }
}
