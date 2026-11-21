package com.vnexsolar.app.feature.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.vnexsolar.app.core.network.DashboardSummaryResponseDto
import com.vnexsolar.app.core.network.WorkspaceApiService
import com.vnexsolar.app.core.preferences.AppPreferences
import com.vnexsolar.app.core.security.SessionVault
import com.vnexsolar.app.core.sync.OfflineRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

enum class DashboardRange(val apiValue: String, val label: String) {
    DAYS_7("7d", "7D"),
    DAYS_30("30d", "30D"),
    DAYS_90("90d", "90D"),
    YTD("ytd", "YTD"),
    ALL("all", "All"),
}

data class DashboardUiState(
    val selectedRange: DashboardRange = DashboardRange.DAYS_30,
    val summary: DashboardSummaryResponseDto? = null,
    val selectedMonthIndex: Int? = null,
    val isRefreshing: Boolean = false,
    val isFromCache: Boolean = false,
    val lastUpdatedEpochMs: Long? = null,
    val errorMessage: String? = null,
)

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val workspaceApiService: WorkspaceApiService,
    private val offlineRepository: OfflineRepository,
    private val sessionVault: SessionVault,
    private val appPreferences: AppPreferences,
    private val json: Json,
) : ViewModel() {

    val displayCurrency: StateFlow<String> = appPreferences.selectedCurrencyFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), "PKR")

    private val _uiState = MutableStateFlow(DashboardUiState())
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

    init {
        loadDashboard(DashboardRange.DAYS_30)
    }

    fun selectRange(range: DashboardRange) {
        if (_uiState.value.selectedRange == range && _uiState.value.summary != null) return
        _uiState.update { it.copy(selectedRange = range, selectedMonthIndex = null) }
        loadDashboard(range)
    }

    fun selectMonth(index: Int?) {
        _uiState.update {
            it.copy(selectedMonthIndex = if (it.selectedMonthIndex == index) null else index)
        }
    }

    fun refresh() {
        loadDashboard(_uiState.value.selectedRange)
    }

    private fun loadDashboard(range: DashboardRange) {
        val orgId = sessionVault.currentSession?.organizationId ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, errorMessage = null) }

            val cached = offlineRepository.getDashboardSnapshot(orgId, range.apiValue)
            if (cached != null && _uiState.value.summary == null) {
                try {
                    val decoded = json.decodeFromString<DashboardSummaryResponseDto>(cached.payloadJson)
                    _uiState.update {
                        it.copy(
                            summary = decoded,
                            isFromCache = true,
                            lastUpdatedEpochMs = cached.updatedAtEpochMs,
                        )
                    }
                } catch (_ex: Exception) {
                    // Ignore malformed snapshot cache
                }
            }

            try {
                val fresh = workspaceApiService.getDashboardSummary(range.apiValue)
                val encoded = json.encodeToString(fresh)
                offlineRepository.saveDashboardSnapshot(orgId, range.apiValue, encoded)
                _uiState.update {
                    it.copy(
                        summary = fresh,
                        isRefreshing = false,
                        isFromCache = false,
                        lastUpdatedEpochMs = System.currentTimeMillis(),
                        errorMessage = null,
                    )
                }
            } catch (ex: Exception) {
                _uiState.update {
                    it.copy(
                        isRefreshing = false,
                        isFromCache = it.summary != null,
                        errorMessage = if (it.summary == null) {
                            ex.message ?: "Unable to fetch dashboard summary"
                        } else {
                            "Showing cached snapshot · ${ex.message ?: "Offline"}"
                        },
                    )
                }
            }
        }
    }
}
