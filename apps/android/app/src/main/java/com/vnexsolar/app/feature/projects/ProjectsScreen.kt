package com.vnexsolar.app.feature.projects

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vnexsolar.app.core.database.entity.CustomerEntity
import com.vnexsolar.app.core.database.entity.ProjectEntity
import com.vnexsolar.app.core.database.entity.SiteEntity
import com.vnexsolar.app.core.designsystem.VNexMetricRow
import com.vnexsolar.app.core.designsystem.VNexPaginationFooter
import com.vnexsolar.app.core.designsystem.VNexSurfaceCard
import com.vnexsolar.app.core.model.DomainConstants
import com.vnexsolar.app.core.navigation.VNexRoutes

@Composable
fun ProjectsScreen(
    canWriteProjects: Boolean = true,
    onNavigate: (String) -> Unit,
    viewModel: ProjectsViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val projects by viewModel.projects.collectAsState()
    val customers by viewModel.customers.collectAsState()
    val sites by viewModel.sites.collectAsState()
    val preferredCurrency by viewModel.preferredCurrency.collectAsState()
    var showCreateDialog by rememberSaveable { mutableStateOf(false) }

    val selectedProject = projects.firstOrNull { it.id == state.selectedProjectId }

    Scaffold(
        floatingActionButton = {
            if (canWriteProjects) {
                FloatingActionButton(onClick = { showCreateDialog = true }) {
                    Icon(Icons.Outlined.Add, contentDescription = "New Project")
                }
            }
        },
    ) { innerPadding ->
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            val isSplit = maxWidth >= 720.dp

            if (isSplit) {
                Row(modifier = Modifier.fillMaxSize()) {
                    ProjectListPane(
                        modifier = Modifier
                            .weight(0.45f)
                            .fillMaxHeight(),
                        state = state,
                        projects = projects,
                        customers = customers,
                        onSearchChange = viewModel::updateSearch,
                        onStageSelect = viewModel::selectStageFilter,
                        onRefresh = viewModel::refresh,
                        onSelectProject = { viewModel.selectProject(it.id) },
                    )
                    Column(
                        modifier = Modifier
                            .weight(0.55f)
                            .fillMaxHeight()
                            .padding(16.dp),
                    ) {
                        if (selectedProject != null) {
                            ProjectDetailPane(
                                project = selectedProject,
                                customer = customers.firstOrNull { it.id == selectedProject.customerId },
                                state = state,
                                showBackButton = false,
                                onBack = { viewModel.selectProject(null) },
                                onNavigate = onNavigate,
                            )
                        } else {
                            VNexSurfaceCard {
                                Text(
                                    text = "Select a solar project to review surveys, engineering, quotations, and installation progress.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(16.dp),
                                )
                            }
                        }
                    }
                }
            } else if (selectedProject != null) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp),
                ) {
                    ProjectDetailPane(
                        project = selectedProject,
                        customer = customers.firstOrNull { it.id == selectedProject.customerId },
                        state = state,
                        showBackButton = true,
                        onBack = { viewModel.selectProject(null) },
                        onNavigate = onNavigate,
                    )
                }
            } else {
                ProjectListPane(
                    modifier = Modifier.fillMaxSize(),
                    state = state,
                    projects = projects,
                    customers = customers,
                    onSearchChange = viewModel::updateSearch,
                    onStageSelect = viewModel::selectStageFilter,
                    onRefresh = viewModel::refresh,
                    onSelectProject = { viewModel.selectProject(it.id) },
                )
            }
        }
    }

    if (showCreateDialog) {
        CreateProjectDialog(
            customers = customers,
            sites = sites,
            defaultCurrency = preferredCurrency,
            isSaving = state.isSaving,
            onCustomerPicked = viewModel::loadSitesForCustomer,
            onDismiss = { showCreateDialog = false },
            onSubmit = { customerId, siteId, title, sysType, kwp, curr ->
                viewModel.createProject(
                    customerId = customerId,
                    siteId = siteId,
                    title = title,
                    systemType = sysType,
                    targetCapacityKwp = kwp,
                    currency = curr,
                    onDone = { showCreateDialog = false },
                )
            },
        )
    }
}

@Composable
private fun ProjectListPane(
    modifier: Modifier,
    state: ProjectsUiState,
    projects: List<ProjectEntity>,
    customers: List<CustomerEntity>,
    onSearchChange: (String) -> Unit,
    onStageSelect: (ProjectStageFilter) -> Unit,
    onRefresh: () -> Unit,
    onSelectProject: (ProjectEntity) -> Unit,
) {
    Column(
        modifier = modifier.padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            OutlinedTextField(
                value = state.searchQuery,
                onValueChange = onSearchChange,
                placeholder = { Text("Search code or title...") },
                leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
            if (state.isRefreshing) {
                CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
            } else {
                IconButton(onClick = onRefresh) {
                    Icon(Icons.Outlined.Refresh, contentDescription = "Refresh projects")
                }
            }
        }

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            ProjectStageFilter.entries.forEach { stage ->
                FilterChip(
                    selected = state.stageFilter == stage,
                    onClick = { onStageSelect(stage) },
                    label = { Text(stage.label) },
                )
            }
        }

        state.statusMessage?.let { msg ->
            Text(msg, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
        }
        state.errorMessage?.let { msg ->
            Text(msg, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
        }

        if (projects.isEmpty()) {
            VNexSurfaceCard {
                Text(
                    text = "No projects match this filter. Tap + after creating a customer and site.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(16.dp),
                )
            }
        } else {
            var visibleCount by rememberSaveable(state.searchQuery, state.stageFilter) { mutableIntStateOf(25) }
            val pageProjects = remember(projects, visibleCount) { projects.take(visibleCount) }

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(pageProjects, key = { it.id }) { project ->
                    val customerName = customers.firstOrNull { it.id == project.customerId }?.fullName ?: "Customer"
                    VNexSurfaceCard(
                        modifier = Modifier.clickable { onSelectProject(project) },
                    ) {
                        Column(
                            modifier = Modifier.padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp),
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Text(
                                    text = project.title,
                                    style = MaterialTheme.typography.titleMedium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f),
                                )
                                Text(
                                    text = project.projectCode,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                            }
                            Text(
                                text = "$customerName · ${project.systemType.uppercase()} · ${project.targetCapacityKwp ?: "-"} kWp",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Text(
                                text = "Stage: ${project.currentStage.replace('_', ' ')} (${project.currency})",
                                style = MaterialTheme.typography.labelMedium,
                            )
                        }
                    }
                }
                item {
                    VNexPaginationFooter(
                        loadedCount = pageProjects.size,
                        totalCount = projects.size,
                        onLoadMore = { visibleCount += 25 },
                    )
                }
            }
        }
    }
}

@Composable
private fun ProjectDetailPane(
    project: ProjectEntity,
    customer: CustomerEntity?,
    state: ProjectsUiState,
    showBackButton: Boolean,
    onBack: () -> Unit,
    onNavigate: (String) -> Unit,
) {
    var selectedTab by rememberSaveable(project.id) { mutableIntStateOf(0) }
    val tabs = listOf("Overview", "Surveys", "Quotes", "Install")

    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (showBackButton) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.Outlined.ArrowBack, contentDescription = "Back to projects")
                }
                Text(
                    text = "${project.projectCode} · ${project.title}",
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        } else {
            Text(
                text = "${project.projectCode} · ${project.title}",
                style = MaterialTheme.typography.headlineMedium,
            )
        }

        TabRow(selectedTabIndex = selectedTab) {
            tabs.forEachIndexed { idx, label ->
                Tab(
                    selected = selectedTab == idx,
                    onClick = { selectedTab = idx },
                    text = { Text(label, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                )
            }
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            when (selectedTab) {
                0 -> {
                    VNexSurfaceCard {
                        Column(modifier = Modifier.padding(14.dp)) {
                            VNexMetricRow("Customer", customer?.fullName ?: project.customerId)
                            VNexMetricRow("System Type", project.systemType)
                            VNexMetricRow("Target Capacity", "${project.targetCapacityKwp ?: "-"} kWp")
                            VNexMetricRow("Stage", project.currentStage.replace('_', ' '))
                            VNexMetricRow("Currency", project.currency)
                            VNexMetricRow("Status", project.status, showDivider = false)
                        }
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        Button(
                            onClick = { onNavigate(VNexRoutes.SURVEYS) },
                            modifier = Modifier.weight(1f),
                        ) {
                            Text("Site Survey")
                        }
                        OutlinedButton(
                            onClick = { onNavigate(VNexRoutes.ENGINEERING) },
                            modifier = Modifier.weight(1f),
                        ) {
                            Text("Solar Design")
                        }
                    }
                }
                1 -> {
                    if (state.projectSurveys.isEmpty()) {
                        VNexSurfaceCard {
                            Text(
                                text = "No surveys recorded yet for this project.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(14.dp),
                            )
                        }
                    } else {
                        state.projectSurveys.forEach { s ->
                            VNexSurfaceCard {
                                Column(modifier = Modifier.padding(14.dp)) {
                                    Text("Status: ${s.surveyStatus}", style = MaterialTheme.typography.titleMedium)
                                    Text("Earthing: ${if (s.earthingAvailable) "Available" else "Pending"}", style = MaterialTheme.typography.bodyMedium)
                                    if (s.notes.isNotBlank()) {
                                        Text(s.notes, style = MaterialTheme.typography.bodyMedium)
                                    }
                                }
                            }
                        }
                    }
                }
                2 -> {
                    if (state.projectQuotations.isEmpty()) {
                        VNexSurfaceCard {
                            Text(
                                text = "No quotations created yet for this project.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(14.dp),
                            )
                        }
                    } else {
                        state.projectQuotations.forEach { q ->
                            VNexSurfaceCard {
                                Column(modifier = Modifier.padding(14.dp)) {
                                    Text("${q.quotationNumber} · v${q.currentRevisionNumber}", style = MaterialTheme.typography.titleMedium)
                                    Text("${q.title} (${q.status})", style = MaterialTheme.typography.bodyMedium)
                                }
                            }
                        }
                    }
                }
                3 -> {
                    if (state.projectJobs.isEmpty()) {
                        VNexSurfaceCard {
                            Text(
                                text = "No installation jobs scheduled yet.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(14.dp),
                            )
                        }
                    } else {
                        state.projectJobs.forEach { j ->
                            VNexSurfaceCard {
                                Column(modifier = Modifier.padding(14.dp)) {
                                    Text("${j.jobCode} · ${j.status}", style = MaterialTheme.typography.titleMedium)
                                    Text("Start: ${j.scheduledStartDate} · Safety: ${if (j.safetyCleared) "Cleared" else "Pending"}", style = MaterialTheme.typography.bodyMedium)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CreateProjectDialog(
    customers: List<CustomerEntity>,
    sites: List<SiteEntity>,
    defaultCurrency: String,
    isSaving: Boolean,
    onCustomerPicked: (String) -> Unit,
    onDismiss: () -> Unit,
    onSubmit: (String, String, String, String, Double?, String) -> Unit,
) {
    var selectedCustomerId by remember(customers) { mutableStateOf(customers.firstOrNull()?.id ?: "") }
    val customerSites = sites.filter { it.customerId == selectedCustomerId }
    var selectedSiteId by remember(customerSites) { mutableStateOf(customerSites.firstOrNull()?.id ?: "") }
    var title by remember { mutableStateOf("") }
    var systemType by remember { mutableStateOf("hybrid") }
    var capacityText by remember { mutableStateOf("10") }
    var currency by remember { mutableStateOf(defaultCurrency) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New Solar Project") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (customers.isEmpty()) {
                    Text(
                        text = "Please create a Customer and Site first from the Customers tab.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.error,
                    )
                } else {
                    Text("Customer", style = MaterialTheme.typography.labelMedium)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        customers.take(8).forEach { cust ->
                            FilterChip(
                                selected = selectedCustomerId == cust.id,
                                onClick = {
                                    selectedCustomerId = cust.id
                                    onCustomerPicked(cust.id)
                                },
                                label = { Text(cust.fullName, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                            )
                        }
                    }
                    Text("Site", style = MaterialTheme.typography.labelMedium)
                    if (customerSites.isEmpty()) {
                        Text(
                            text = "No sites found for selected customer — add one under Customers first.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error,
                        )
                    } else {
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            customerSites.forEach { site ->
                                FilterChip(
                                    selected = selectedSiteId == site.id,
                                    onClick = { selectedSiteId = site.id },
                                    label = { Text(site.siteName, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                                )
                            }
                        }
                    }
                }
                OutlinedTextField(value = title, onValueChange = { title = it }, label = { Text("Project Title *") }, singleLine = true)
                OutlinedTextField(
                    value = capacityText,
                    onValueChange = { capacityText = it },
                    label = { Text("Target Capacity (kWp)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true,
                )
                Text("System Type", style = MaterialTheme.typography.labelMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("on_grid", "hybrid", "off_grid").forEach { st ->
                        FilterChip(
                            selected = systemType == st,
                            onClick = { systemType = st },
                            label = { Text(st.replace('_', ' ')) },
                        )
                    }
                }
                Text("Currency", style = MaterialTheme.typography.labelMedium)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    DomainConstants.SUPPORTED_CURRENCIES.forEach { c ->
                        FilterChip(
                            selected = currency == c.code,
                            onClick = { currency = c.code },
                            label = { Text(c.code) },
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                enabled = !isSaving && selectedCustomerId.isNotBlank() && selectedSiteId.isNotBlank() && title.trim().length >= 2,
                onClick = {
                    onSubmit(
                        selectedCustomerId,
                        selectedSiteId,
                        title,
                        systemType,
                        capacityText.toDoubleOrNull(),
                        currency,
                    )
                },
            ) {
                Text(if (isSaving) "Creating..." else "Create")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}
