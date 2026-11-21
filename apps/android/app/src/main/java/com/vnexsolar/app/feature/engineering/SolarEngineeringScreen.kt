package com.vnexsolar.app.feature.engineering

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.vnexsolar.app.core.database.entity.ProjectEntity
import com.vnexsolar.app.core.designsystem.VNexColors
import com.vnexsolar.app.core.designsystem.VNexMetricRow
import com.vnexsolar.app.core.designsystem.VNexOfflineStatusBanner
import com.vnexsolar.app.core.designsystem.VNexSurfaceCard
import com.vnexsolar.app.core.model.DomainConstants
import com.vnexsolar.app.core.network.SolarDesignListItemDto
import java.util.Locale
import kotlin.math.roundToLong

private val ENGINEERING_TABS = listOf(
    "Load & PV",
    "Array & MPPT",
    "Battery & Cables",
    "Roof & Yield",
    "ROI & Designs",
)

@Composable
fun SolarEngineeringScreen(
    canWriteEngineering: Boolean = true,
    canApproveEngineering: Boolean = false,
    viewModel: SolarEngineeringViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val isOnline by viewModel.isOnline.collectAsStateWithLifecycle()
    val projects by viewModel.projects.collectAsStateWithLifecycle()
    val calc = state.result
    var showAddApplianceDialog by remember { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize()) {
        ScrollableTabRow(
            selectedTabIndex = state.selectedTabIndex,
            edgePadding = 12.dp,
            containerColor = MaterialTheme.colorScheme.surface,
        ) {
            ENGINEERING_TABS.forEachIndexed { idx, title ->
                Tab(
                    selected = state.selectedTabIndex == idx,
                    onClick = { viewModel.selectTab(idx) },
                    text = { Text(text = title, style = MaterialTheme.typography.bodyMedium) },
                )
            }
        }

        BoxWithConstraints(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        ) {
            val isWideTablet = maxWidth >= 720.dp

            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Solar Engineering Suite",
                            style = MaterialTheme.typography.headlineMedium,
                        )
                        Text(
                            text = "Engine ${calc.formulaVersion} · ${state.selectedCity} · ${calc.actualDcKwp} kWp DC / ${calc.totalRatedAcKw} kW AC",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    IconButton(onClick = viewModel::refreshRemoteCatalogAndDesigns) {
                        Icon(Icons.Outlined.Refresh, contentDescription = "Refresh catalog and designs")
                    }
                }

                VNexOfflineStatusBanner(
                    isOnline = isOnline,
                    pendingOutboxCount = if (state.savedMessage != null) 1 else 0,
                )

                // Hard electrical safety blockers
                if (!calc.safetyChecksPassed) {
                    EngineeringAlertCard(
                        title = "Electrical Safety Blocker (Submission Blocked)",
                        messages = calc.hardSafetyErrors,
                        isCritical = true,
                    )
                }

                // Non-blocking engineering warnings
                if (calc.engineeringWarnings.isNotEmpty()) {
                    EngineeringAlertCard(
                        title = "Engineering Advisories (${calc.engineeringWarnings.size})",
                        messages = calc.engineeringWarnings,
                        isCritical = false,
                    )
                }

                when (state.selectedTabIndex) {
                    0 -> LoadAndSizingTab(
                        state = state,
                        isWideTablet = isWideTablet,
                        onApplyCity = viewModel::applyCityPreset,
                        onToggleManualOverride = viewModel::setManualLoadOverride,
                        onUpdateManualFields = viewModel::updateManualLoadFields,
                        onIncrementQty = viewModel::incrementApplianceQty,
                        onToggleCritical = viewModel::toggleApplianceCritical,
                        onRemoveAppliance = viewModel::removeAppliance,
                        onOpenAddAppliance = { showAddApplianceDialog = true },
                    )
                    1 -> ArrayAndMpptTab(
                        state = state,
                        isWideTablet = isWideTablet,
                        onSelectModule = viewModel::selectModulePreset,
                        onSelectInverter = viewModel::selectInverterPreset,
                        onUpdateTopology = viewModel::updateTopology,
                    )
                    2 -> BatteryAndCablesTab(
                        state = state,
                        isWideTablet = isWideTablet,
                        onSelectBattery = viewModel::selectBatteryPreset,
                        onUpdateStorageAndCables = viewModel::updateStorageAndCables,
                    )
                    3 -> RoofAndYieldTab(
                        state = state,
                        isWideTablet = isWideTablet,
                        onUpdateRoofAndYield = viewModel::updateRoofAndYield,
                    )
                    4 -> RoiAndDesignsTab(
                        state = state,
                        projects = projects,
                        isWideTablet = isWideTablet,
                        canWriteEngineering = canWriteEngineering,
                        canApproveEngineering = canApproveEngineering,
                        onUpdateFinancials = viewModel::updateFinancials,
                        onSelectProject = viewModel::selectProject,
                        onUpdateTitleAndNotes = viewModel::updateTitleAndNotes,
                        onSaveDesign = viewModel::saveDesignOnlineOrOffline,
                        onSubmitDesign = viewModel::submitDesignRevision,
                        onApproveDesign = viewModel::approveDesign,
                    )
                }

                // Explicit professional engineering verification disclaimer
                VNexSurfaceCard {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(
                            text = "Engineering Estimate vs PE Verification",
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Text(
                            text = calc.designDisclaimer,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }

    if (showAddApplianceDialog) {
        AddApplianceDialog(
            onDismiss = { showAddApplianceDialog = false },
            onAdd = { name, qty, watts, hours, critical, surge ->
                viewModel.addAppliance(name, qty, watts, hours, critical, surge)
                showAddApplianceDialog = false
            },
        )
    }
}

@Composable
private fun EngineeringAlertCard(
    title: String,
    messages: List<String>,
    isCritical: Boolean,
) {
    val accent = if (isCritical) VNexColors.CriticalRed else VNexColors.WarningAmber
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        color = accent.copy(alpha = 0.08f),
        border = BorderStroke(1.dp, accent.copy(alpha = 0.55f)),
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                color = accent,
            )
            messages.forEach { msg ->
                Text(
                    text = "• $msg",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
        }
    }
}

@Composable
private fun ResponsiveTwoPane(
    isWideTablet: Boolean,
    left: @Composable () -> Unit,
    right: @Composable () -> Unit,
) {
    if (isWideTablet) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                left()
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                right()
            }
        }
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            left()
            right()
        }
    }
}

@Composable
private fun LoadAndSizingTab(
    state: SolarEngineeringUiState,
    isWideTablet: Boolean,
    onApplyCity: (CitySolarPreset) -> Unit,
    onToggleManualOverride: (Boolean) -> Unit,
    onUpdateManualFields: (String, String, String) -> Unit,
    onIncrementQty: (String, Int) -> Unit,
    onToggleCritical: (String) -> Unit,
    onRemoveAppliance: (String) -> Unit,
    onOpenAddAppliance: () -> Unit,
) {
    val calc = state.result

    ResponsiveTwoPane(
        isWideTablet = isWideTablet,
        left = {
            VNexSurfaceCard {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text("Site Climate Preset", style = MaterialTheme.typography.titleMedium)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        EngineeringPresets.CITIES.forEach { city ->
                            FilterChip(
                                selected = state.selectedCity == city.city,
                                onClick = { onApplyCity(city) },
                                label = { Text("${city.city} (${city.peakSunHoursPerDay} PSH)") },
                            )
                        }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Manual kWh / Peak kW Override", style = MaterialTheme.typography.bodyMedium)
                            Text(
                                text = if (state.useManualLoadOverride) "Using manual site meter totals" else "Computed from appliance load list",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Switch(
                            checked = state.useManualLoadOverride,
                            onCheckedChange = onToggleManualOverride,
                        )
                    }

                    if (state.useManualLoadOverride) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            DecimalInputField(
                                label = "Daily kWh",
                                value = state.overrideDailyKwhText,
                                onValueChange = { onUpdateManualFields(it, state.overridePeakKwText, state.overrideCriticalKwhText) },
                                modifier = Modifier.weight(1f),
                            )
                            DecimalInputField(
                                label = "Peak kW",
                                value = state.overridePeakKwText,
                                onValueChange = { onUpdateManualFields(state.overrideDailyKwhText, it, state.overrideCriticalKwhText) },
                                modifier = Modifier.weight(1f),
                            )
                            DecimalInputField(
                                label = "Backup kWh",
                                value = state.overrideCriticalKwhText,
                                onValueChange = { onUpdateManualFields(state.overrideDailyKwhText, state.overridePeakKwText, it) },
                                modifier = Modifier.weight(1f),
                            )
                        }
                    } else {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = "Appliance Load List (${state.loadProfiles.size})",
                                style = MaterialTheme.typography.titleMedium,
                            )
                            OutlinedButton(onClick = onOpenAddAppliance) {
                                Icon(Icons.Outlined.Add, contentDescription = null, modifier = Modifier.size(16.dp))
                                Text(" Add Load")
                            }
                        }

                        state.loadProfiles.forEachIndexed { idx, item ->
                            val itemKwh = (item.quantity * item.ratedPowerW * item.dailyHours) / 1000.0
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "${item.applianceName} (${item.ratedPowerW.toInt()}W × ${item.dailyHours}h)",
                                        style = MaterialTheme.typography.bodyMedium,
                                    )
                                    Text(
                                        text = "${String.format(Locale.US, "%.2f", itemKwh)} kWh/d · Surge ${item.surgeFactor}x${if (item.isCriticalBackupLoad) " · Critical" else ""}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = if (item.isCriticalBackupLoad) VNexColors.NominalGreen else MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    TextButton(onClick = { onIncrementQty(item.id, -1) }) { Text("-") }
                                    Text("${item.quantity}", style = MaterialTheme.typography.labelMedium)
                                    TextButton(onClick = { onIncrementQty(item.id, 1) }) { Text("+") }
                                    TextButton(onClick = { onToggleCritical(item.id) }) {
                                        Text(if (item.isCriticalBackupLoad) "Crit" else "Norm")
                                    }
                                    IconButton(onClick = { onRemoveAppliance(item.id) }) {
                                        Icon(Icons.Outlined.DeleteOutline, contentDescription = "Remove appliance")
                                    }
                                }
                            }
                            if (idx < state.loadProfiles.lastIndex) {
                                HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                            }
                        }
                    }
                }
            }
        },
        right = {
            VNexSurfaceCard {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text("Load & System Sizing Summary", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(4.dp))
                    VNexMetricRow("Daily Energy Consumption", "${calc.dailyEnergyKwh} kWh/day")
                    VNexMetricRow("Connected Load Power", "${calc.connectedPowerKw} kW")
                    VNexMetricRow("Peak Surge Power", "${calc.peakSurgePowerKw} kW")
                    VNexMetricRow("Critical Backup Load", "${calc.criticalBackupDailyKwh} kWh/day")
                    VNexMetricRow("Required PV Capacity", "${calc.requiredPvKwp} kWp")
                    VNexMetricRow("Configured Array", "${calc.actualDcKwp} kWp (${calc.totalPanelCount} panels)")
                    VNexMetricRow("Total Inverter AC", "${calc.totalRatedAcKw} kW")
                    VNexMetricRow("DC-to-AC Ratio", "${calc.dcAcRatio}", showDivider = false)
                }
            }
        },
    )
}

@Composable
private fun ArrayAndMpptTab(
    state: SolarEngineeringUiState,
    isWideTablet: Boolean,
    onSelectModule: (Int) -> Unit,
    onSelectInverter: (Int) -> Unit,
    onUpdateTopology: (String, String, String, String, String, String) -> Unit,
) {
    val calc = state.result
    val selectedModule = state.availableModules.getOrElse(state.selectedModuleIndex) { EngineeringPresets.MODULES.first() }
    val selectedInverter = state.availableInverters.getOrElse(state.selectedInverterIndex) { EngineeringPresets.INVERTERS.first() }

    ResponsiveTwoPane(
        isWideTablet = isWideTablet,
        left = {
            VNexSurfaceCard {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text("PV Module Spec", style = MaterialTheme.typography.titleMedium)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        state.availableModules.forEachIndexed { idx, mod ->
                            FilterChip(
                                selected = state.selectedModuleIndex == idx,
                                onClick = { onSelectModule(idx) },
                                label = { Text("${mod.pmaxW.toInt()}W ${mod.manufacturer}") },
                            )
                        }
                    }
                    Text(
                        text = "${selectedModule.modelName} · Voc ${selectedModule.vocV}V · Vmp ${selectedModule.vmpV}V · Imp ${selectedModule.impA}A",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    Text("Inverter Spec", style = MaterialTheme.typography.titleMedium)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        state.availableInverters.forEachIndexed { idx, inv ->
                            FilterChip(
                                selected = state.selectedInverterIndex == idx,
                                onClick = { onSelectInverter(idx) },
                                label = { Text("${(inv.ratedAcPowerW / 1000).toInt()}kW ${inv.inverterType}") },
                            )
                        }
                    }
                    Text(
                        text = "${selectedInverter.modelName} · Max ${selectedInverter.maxDcVoltageV.toInt()}V · MPPT ${selectedInverter.mpptMinV.toInt()}–${selectedInverter.mpptMaxV.toInt()}V · ${selectedInverter.maxInputCurrentPerMpptA}A/MPPT",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )

                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        DecimalInputField(
                            label = "Series/Str",
                            value = state.modulesInSeriesText,
                            onValueChange = { onUpdateTopology(it, state.parallelStringsText, state.activeMpptText, state.inverterCountText, state.ambientMinTempCText, state.ambientMaxTempCText) },
                            modifier = Modifier.weight(1f),
                        )
                        DecimalInputField(
                            label = "Parallel/MPPT",
                            value = state.parallelStringsText,
                            onValueChange = { onUpdateTopology(state.modulesInSeriesText, it, state.activeMpptText, state.inverterCountText, state.ambientMinTempCText, state.ambientMaxTempCText) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        DecimalInputField(
                            label = "Active MPPTs",
                            value = state.activeMpptText,
                            onValueChange = { onUpdateTopology(state.modulesInSeriesText, state.parallelStringsText, it, state.inverterCountText, state.ambientMinTempCText, state.ambientMaxTempCText) },
                            modifier = Modifier.weight(1f),
                        )
                        DecimalInputField(
                            label = "Inverters",
                            value = state.inverterCountText,
                            onValueChange = { onUpdateTopology(state.modulesInSeriesText, state.parallelStringsText, state.activeMpptText, it, state.ambientMinTempCText, state.ambientMaxTempCText) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        DecimalInputField(
                            label = "Min Ambient °C",
                            value = state.ambientMinTempCText,
                            onValueChange = { onUpdateTopology(state.modulesInSeriesText, state.parallelStringsText, state.activeMpptText, state.inverterCountText, it, state.ambientMaxTempCText) },
                            modifier = Modifier.weight(1f),
                        )
                        DecimalInputField(
                            label = "Max Ambient °C",
                            value = state.ambientMaxTempCText,
                            onValueChange = { onUpdateTopology(state.modulesInSeriesText, state.parallelStringsText, state.activeMpptText, state.inverterCountText, state.ambientMinTempCText, it) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        },
        right = {
            VNexSurfaceCard {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text("String Voltage & MPPT Window", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(4.dp))
                    VNexMetricRow("Module Cold Voc", "${calc.moduleColdVocV} V")
                    VNexMetricRow(
                        label = "String Cold Voc",
                        value = "${calc.stringColdVocV} V (${if (calc.vocOvervoltageFault) "FAULT > ${calc.vocLimitV}V" else "Max ${calc.vocLimitV}V"})",
                    )
                    VNexMetricRow("Module Hot Vmp", "${calc.moduleHotVmpV} V")
                    VNexMetricRow(
                        label = "String Hot Vmp",
                        value = "${calc.stringHotVmpV} V (${if (calc.mpptWindowValid) "In Window" else "Out of Range"})",
                    )
                    VNexMetricRow("Safe Series Bounds", "${calc.minModulesInSeries} – ${calc.maxModulesInSeries} modules")
                    VNexMetricRow("MPPT Operating Imp", "${calc.mpptOperatingCurrentA} A (${if (calc.mpptCurrentExceeded) "EXCEEDED" else "OK"})")
                    VNexMetricRow("MPPT Short-Circuit Isc", "${calc.mpptShortCircuitCurrentA} A", showDivider = false)
                }
            }
        },
    )
}

@Composable
private fun BatteryAndCablesTab(
    state: SolarEngineeringUiState,
    isWideTablet: Boolean,
    onSelectBattery: (Int) -> Unit,
    onUpdateStorageAndCables: (String, String, String, String, String, String) -> Unit,
) {
    val calc = state.result
    val selectedInv = state.availableInverters.getOrElse(state.selectedInverterIndex) { EngineeringPresets.INVERTERS.first() }
    val isOnGrid = selectedInv.inverterType == "on_grid"

    ResponsiveTwoPane(
        isWideTablet = isWideTablet,
        left = {
            VNexSurfaceCard {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text("Battery Bank Sizing", style = MaterialTheme.typography.titleMedium)
                    if (isOnGrid) {
                        Text(
                            text = "On-Grid inverter selected — battery bank disabled (0 kWh).",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            state.availableBatteries.forEachIndexed { idx, bat ->
                                FilterChip(
                                    selected = state.selectedBatteryIndex == idx,
                                    onClick = { onSelectBattery(idx) },
                                    label = { Text("${bat.manufacturer} ${String.format(Locale.US, "%.1f", bat.energyWh / 1000.0)}kWh") },
                                )
                            }
                        }
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            DecimalInputField(
                                label = "Autonomy Days",
                                value = state.autonomyDaysText,
                                onValueChange = { onUpdateStorageAndCables(it, state.batteryUnitsOverrideText, state.dcCableLengthText, state.dcCableMm2Text, state.acCableLengthText, state.acCableMm2Text) },
                                modifier = Modifier.weight(1f),
                            )
                            DecimalInputField(
                                label = "Units Override",
                                value = state.batteryUnitsOverrideText,
                                onValueChange = { onUpdateStorageAndCables(state.autonomyDaysText, it, state.dcCableLengthText, state.dcCableMm2Text, state.acCableLengthText, state.acCableMm2Text) },
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }

                    Text("Copper Cable Sizing (DC & AC)", style = MaterialTheme.typography.titleMedium)
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        DecimalInputField(
                            label = "DC 1-Way (m)",
                            value = state.dcCableLengthText,
                            onValueChange = { onUpdateStorageAndCables(state.autonomyDaysText, state.batteryUnitsOverrideText, it, state.dcCableMm2Text, state.acCableLengthText, state.acCableMm2Text) },
                            modifier = Modifier.weight(1f),
                        )
                        DecimalInputField(
                            label = "DC Size (mm²)",
                            value = state.dcCableMm2Text,
                            onValueChange = { onUpdateStorageAndCables(state.autonomyDaysText, state.batteryUnitsOverrideText, state.dcCableLengthText, it, state.acCableLengthText, state.acCableMm2Text) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        DecimalInputField(
                            label = "AC 1-Way (m)",
                            value = state.acCableLengthText,
                            onValueChange = { onUpdateStorageAndCables(state.autonomyDaysText, state.batteryUnitsOverrideText, state.dcCableLengthText, state.dcCableMm2Text, it, state.acCableMm2Text) },
                            modifier = Modifier.weight(1f),
                        )
                        DecimalInputField(
                            label = "AC Size (mm²)",
                            value = state.acCableMm2Text,
                            onValueChange = { onUpdateStorageAndCables(state.autonomyDaysText, state.batteryUnitsOverrideText, state.dcCableLengthText, state.dcCableMm2Text, state.acCableLengthText, it) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }
        },
        right = {
            VNexSurfaceCard {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text("Storage, Voltage Drop & Protection", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(4.dp))
                    VNexMetricRow("Req. Usable / Nominal", "${calc.requiredUsableBatteryKwh} / ${calc.requiredNominalBatteryKwh} kWh")
                    VNexMetricRow("Recommended Units", "${calc.recommendedBatteryUnits} units")
                    VNexMetricRow("Installed Battery Bank", "${calc.installedNominalBatteryKwh} kWh (${calc.installedUsableBatteryKwh} usable)")
                    VNexMetricRow("Est. Critical Backup", "${calc.backupAutonomyHours} hours")
                    VNexMetricRow("DC Voltage Drop", "${calc.dcVoltageDropV}V (${calc.dcVoltageDropPct}% · ${if (calc.dcCablePass) "PASS" else ">2%"})")
                    VNexMetricRow("AC Current / Phase", "${calc.acCurrentPerInverterA} A")
                    VNexMetricRow("AC Voltage Drop", "${calc.acVoltageDropV}V (${calc.acVoltageDropPct}% · ${if (calc.acCablePass) "PASS" else ">2.5%"})")
                    VNexMetricRow("String Fuse / AC MCB", "${calc.recommendedStringFuseA}A DC / ${calc.recommendedAcBreakerA}A AC")
                    VNexMetricRow("DC Surge Protection (SPD)", "${calc.recommendedDcSpdVoltageV}V Type II")
                    VNexMetricRow("Earthing Conductor", "${calc.recommendedEarthingMm2} mm² (Target <= ${calc.targetEarthResistanceOhms} Ω)", showDivider = false)
                }
            }
        },
    )
}

@Composable
private fun RoofAndYieldTab(
    state: SolarEngineeringUiState,
    isWideTablet: Boolean,
    onUpdateRoofAndYield: (String, String, String, String, String, String, String, String) -> Unit,
) {
    val calc = state.result

    ResponsiveTwoPane(
        isWideTablet = isWideTablet,
        left = {
            VNexSurfaceCard {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text("Roof Geometry & Irradiance", style = MaterialTheme.typography.titleMedium)
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        DecimalInputField(
                            label = "Usable Roof (m²)",
                            value = state.usableRoofAreaM2Text,
                            onValueChange = { onUpdateRoofAndYield(it, state.tiltDegreesText, state.azimuthDegreesText, state.shadingLossPctText, state.peakSunHoursText, state.siteLatitudeText, state.windSpeedMsText, state.performanceRatioText) },
                            modifier = Modifier.weight(1f),
                        )
                        DecimalInputField(
                            label = "Peak Sun Hrs",
                            value = state.peakSunHoursText,
                            onValueChange = { onUpdateRoofAndYield(state.usableRoofAreaM2Text, state.tiltDegreesText, state.azimuthDegreesText, state.shadingLossPctText, it, state.siteLatitudeText, state.windSpeedMsText, state.performanceRatioText) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        DecimalInputField(
                            label = "Tilt (°)",
                            value = state.tiltDegreesText,
                            onValueChange = { onUpdateRoofAndYield(state.usableRoofAreaM2Text, it, state.azimuthDegreesText, state.shadingLossPctText, state.peakSunHoursText, state.siteLatitudeText, state.windSpeedMsText, state.performanceRatioText) },
                            modifier = Modifier.weight(1f),
                        )
                        DecimalInputField(
                            label = "Azimuth (°)",
                            value = state.azimuthDegreesText,
                            onValueChange = { onUpdateRoofAndYield(state.usableRoofAreaM2Text, state.tiltDegreesText, it, state.shadingLossPctText, state.peakSunHoursText, state.siteLatitudeText, state.windSpeedMsText, state.performanceRatioText) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        DecimalInputField(
                            label = "Shading (%)",
                            value = state.shadingLossPctText,
                            onValueChange = { onUpdateRoofAndYield(state.usableRoofAreaM2Text, state.tiltDegreesText, state.azimuthDegreesText, it, state.peakSunHoursText, state.siteLatitudeText, state.windSpeedMsText, state.performanceRatioText) },
                            modifier = Modifier.weight(1f),
                        )
                        DecimalInputField(
                            label = "Latitude (°N)",
                            value = state.siteLatitudeText,
                            onValueChange = { onUpdateRoofAndYield(state.usableRoofAreaM2Text, state.tiltDegreesText, state.azimuthDegreesText, state.shadingLossPctText, state.peakSunHoursText, it, state.windSpeedMsText, state.performanceRatioText) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        DecimalInputField(
                            label = "Wind Speed (m/s)",
                            value = state.windSpeedMsText,
                            onValueChange = { onUpdateRoofAndYield(state.usableRoofAreaM2Text, state.tiltDegreesText, state.azimuthDegreesText, state.shadingLossPctText, state.peakSunHoursText, state.siteLatitudeText, it, state.performanceRatioText) },
                            modifier = Modifier.weight(1f),
                        )
                        DecimalInputField(
                            label = "Perf Ratio (PR)",
                            value = state.performanceRatioText,
                            onValueChange = { onUpdateRoofAndYield(state.usableRoofAreaM2Text, state.tiltDegreesText, state.azimuthDegreesText, state.shadingLossPctText, state.peakSunHoursText, state.siteLatitudeText, state.windSpeedMsText, it) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                    Text(
                        text = calc.orientationAdvisory,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        },
        right = {
            VNexSurfaceCard {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    Text("Roof Fit, Generation & Net Metering", style = MaterialTheme.typography.titleMedium)
                    Spacer(Modifier.height(4.dp))
                    VNexMetricRow("Roof Area Required", "${calc.requiredRoofAreaM2} m² (${calc.roofAreaUtilizationPct}% · ${if (calc.roofFitPass) "FITS" else "TOO SMALL"})")
                    VNexMetricRow("Max Panels Fit on Roof", "${calc.maxRoofPanelCapacity} panels")
                    VNexMetricRow("Array Dead Load / Wind", "${calc.totalArrayMassKg} kg (${calc.distributedRoofLoadKgM2} kg/m²) · ${calc.estimatedWindUpliftKn} kN")
                    VNexMetricRow("Orientation Factor", "${calc.orientationFactor} (Opt tilt ${calc.optimalTiltDeg}°)")
                    VNexMetricRow("Expected Daily Yield", "${calc.expectedDailyYieldKwh} kWh/day")
                    VNexMetricRow("Expected Annual Yield", "${calc.expectedAnnualYieldKwh} kWh/yr (${calc.specificYieldKwhPerKwp} kWh/kWp)")
                    VNexMetricRow("Annual Solar Offset", "${calc.annualSolarOffsetPct}% of ${calc.annualDemandKwh} kWh")
                    VNexMetricRow("Self-Consumed / Net Export", "${calc.estimatedSelfConsumedKwh} / ${calc.estimatedGridExportKwh} kWh/yr")
                    VNexMetricRow("25-Yr Degraded Yield", "${calc.lifetime25YrYieldKwh} kWh")
                    VNexMetricRow("CO₂ Avoided (Yr / 25-Yr)", "${calc.annualCo2AvoidedKg} kg / ${calc.lifetimeCo2AvoidedTonnes} t", showDivider = false)
                }
            }
        },
    )
}

@Composable
private fun RoiAndDesignsTab(
    state: SolarEngineeringUiState,
    projects: List<ProjectEntity>,
    isWideTablet: Boolean,
    canWriteEngineering: Boolean,
    canApproveEngineering: Boolean,
    onUpdateFinancials: (String, String, String, String, String, String) -> Unit,
    onSelectProject: (String) -> Unit,
    onUpdateTitleAndNotes: (String, String) -> Unit,
    onSaveDesign: () -> Unit,
    onSubmitDesign: (String, Int) -> Unit,
    onApproveDesign: (String) -> Unit,
) {
    val calc = state.result
    val currency = calc.currency
    val fmtMajor: (Double) -> String = { amount ->
        DomainConstants.formatMinorCurrency((amount * 100.0).roundToLong(), currency)
    }

    ResponsiveTwoPane(
        isWideTablet = isWideTablet,
        left = {
            VNexSurfaceCard {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text("Financial & Tariff Inputs ($currency)", style = MaterialTheme.typography.titleMedium)
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        DecimalInputField(
                            label = "CAPEX ($currency)",
                            value = state.systemCapexText,
                            onValueChange = { onUpdateFinancials(it, state.gridTariffText, state.exportTariffText, state.annualOmCostText, state.escalationPctText, state.discountRatePctText) },
                            modifier = Modifier.weight(1f),
                        )
                        DecimalInputField(
                            label = "Annual O&M",
                            value = state.annualOmCostText,
                            onValueChange = { onUpdateFinancials(state.systemCapexText, state.gridTariffText, state.exportTariffText, it, state.escalationPctText, state.discountRatePctText) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        DecimalInputField(
                            label = "Grid Tariff / kWh",
                            value = state.gridTariffText,
                            onValueChange = { onUpdateFinancials(state.systemCapexText, it, state.exportTariffText, state.annualOmCostText, state.escalationPctText, state.discountRatePctText) },
                            modifier = Modifier.weight(1f),
                        )
                        DecimalInputField(
                            label = "Export Tariff / kWh",
                            value = state.exportTariffText,
                            onValueChange = { onUpdateFinancials(state.systemCapexText, state.gridTariffText, it, state.annualOmCostText, state.escalationPctText, state.discountRatePctText) },
                            modifier = Modifier.weight(1f),
                        )
                    }
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        DecimalInputField(
                            label = "Escalation %/yr",
                            value = state.escalationPctText,
                            onValueChange = { onUpdateFinancials(state.systemCapexText, state.gridTariffText, state.exportTariffText, state.annualOmCostText, it, state.discountRatePctText) },
                            modifier = Modifier.weight(1f),
                        )
                        DecimalInputField(
                            label = "Discount Rate %",
                            value = state.discountRatePctText,
                            onValueChange = { onUpdateFinancials(state.systemCapexText, state.gridTariffText, state.exportTariffText, state.annualOmCostText, state.escalationPctText, it) },
                            modifier = Modifier.weight(1f),
                        )
                    }

                    HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                    VNexMetricRow("Year-1 Gross Savings", fmtMajor(calc.firstYearGrossSavings))
                    VNexMetricRow("Year-1 Net Cashflow", fmtMajor(calc.firstYearNetCashflow))
                    VNexMetricRow("Simple Payback Period", "${calc.simplePaybackYears ?: "N/A"} years")
                    VNexMetricRow("25-Year ROI", "${calc.roi25YrPct}%")
                    VNexMetricRow("25-Year NPV", fmtMajor(calc.netPresentValue))
                    VNexMetricRow("LCOE per kWh", "${calc.lcoePerKwh} $currency/kWh", showDivider = false)
                }
            }
        },
        right = {
            VNexSurfaceCard {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text("Attach & Save Project Design", style = MaterialTheme.typography.titleMedium)
                    if (projects.isEmpty()) {
                        Text(
                            text = "No cached projects yet. Open Projects tab to sync or create a project before linking.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    } else {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            projects.forEach { proj ->
                                FilterChip(
                                    selected = state.selectedProjectId == proj.id,
                                    onClick = { onSelectProject(proj.id) },
                                    label = { Text("${proj.projectCode} · ${proj.title}") },
                                )
                            }
                        }
                    }

                    OutlinedTextField(
                        value = state.title,
                        onValueChange = { onUpdateTitleAndNotes(it, state.notes) },
                        label = { Text("Design Revision Title") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = state.notes,
                        onValueChange = { onUpdateTitleAndNotes(state.title, it) },
                        label = { Text("Engineering Notes (Optional)") },
                        modifier = Modifier.fillMaxWidth(),
                    )

                    if (canWriteEngineering) {
                        Button(
                            onClick = onSaveDesign,
                            enabled = !state.isSaving,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            if (state.isSaving) {
                                CircularProgressIndicator(
                                    modifier = Modifier.size(18.dp),
                                    strokeWidth = 2.dp,
                                    color = MaterialTheme.colorScheme.onPrimary,
                                )
                            } else {
                                Text("Save Design (Syncs Online or Queues Offline)")
                            }
                        }
                    }

                    state.errorMessage?.let { err ->
                        Text(text = err, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
                    }
                    state.savedMessage?.let { msg ->
                        Text(text = msg, style = MaterialTheme.typography.bodySmall, color = VNexColors.NominalGreen)
                    }
                }
            }

            if (state.savedDesigns.isNotEmpty()) {
                VNexSurfaceCard {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Text("Saved Project Designs (${state.savedDesigns.size})", style = MaterialTheme.typography.titleMedium)
                        state.savedDesigns.forEachIndexed { idx, item ->
                            SavedDesignRow(
                                item = item,
                                canWrite = canWriteEngineering,
                                canApprove = canApproveEngineering,
                                onSubmit = {
                                    onSubmitDesign(item.design.id, item.latestRevision.revisionNumber)
                                },
                                onApprove = { onApproveDesign(item.design.id) },
                            )
                            if (idx < state.savedDesigns.lastIndex) {
                                HorizontalDivider(color = MaterialTheme.colorScheme.outline)
                            }
                        }
                    }
                }
            }
        },
    )
}

@Composable
private fun SavedDesignRow(
    item: SolarDesignListItemDto,
    canWrite: Boolean,
    canApprove: Boolean,
    onSubmit: () -> Unit,
    onApprove: () -> Unit,
) {
    val calc = item.latestRevision.calculations
    val revStatus = item.latestRevision.status
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "${item.design.designCode} · ${item.design.title}",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Text(
                    text = "Rev ${item.latestRevision.revisionNumber} · $revStatus · ${calc.actualDcKwp} kWp · Voc ${calc.stringColdVocV}V",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        if (revStatus != "approved") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (canWrite && revStatus == "draft") {
                    OutlinedButton(
                        onClick = onSubmit,
                        enabled = calc.safetyChecksPassed,
                    ) {
                        Text("Submit Rev")
                    }
                }
                if (canApprove) {
                    Button(
                        onClick = onApprove,
                        enabled = calc.safetyChecksPassed,
                    ) {
                        Text("Approve & Lock")
                    }
                }
            }
        }
    }
}

@Composable
private fun DecimalInputField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
        modifier = modifier,
    )
}

@Composable
private fun AddApplianceDialog(
    onDismiss: () -> Unit,
    onAdd: (name: String, qty: Int, watts: Double, hours: Double, critical: Boolean, surge: Double) -> Unit,
) {
    var name by remember { mutableStateOf("Split AC (1 Ton)") }
    var qty by remember { mutableStateOf("1") }
    var watts by remember { mutableStateOf("1100") }
    var hours by remember { mutableStateOf("6") }
    var surge by remember { mutableStateOf("1.4") }
    var critical by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Appliance Load") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Appliance Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DecimalInputField("Qty", qty, { qty = it }, Modifier.weight(1f))
                    DecimalInputField("Watts", watts, { watts = it }, Modifier.weight(1f))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    DecimalInputField("Hrs/Day", hours, { hours = it }, Modifier.weight(1f))
                    DecimalInputField("Surge x", surge, { surge = it }, Modifier.weight(1f))
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = critical, onCheckedChange = { critical = it })
                    Text("Critical Backup Load (UPS/Battery)")
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onAdd(
                        name,
                        qty.toIntOrNull() ?: 1,
                        watts.toDoubleOrNull() ?: 100.0,
                        hours.toDoubleOrNull() ?: 4.0,
                        critical,
                        surge.toDoubleOrNull() ?: 1.0,
                    )
                },
            ) {
                Text("Add")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}
