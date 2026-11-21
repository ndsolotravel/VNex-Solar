package com.vnexsolar.app.feature.customers

import androidx.compose.foundation.clickable
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.vnexsolar.app.core.database.entity.CustomerEntity
import com.vnexsolar.app.core.database.entity.ProjectEntity
import com.vnexsolar.app.core.database.entity.SiteEntity
import com.vnexsolar.app.core.designsystem.VNexMetricRow
import com.vnexsolar.app.core.designsystem.VNexPaginationFooter
import com.vnexsolar.app.core.designsystem.VNexSurfaceCard

@Composable
fun CustomersScreen(
    canWriteCustomers: Boolean = true,
    viewModel: CustomersViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsState()
    val customers by viewModel.customers.collectAsState()
    val sites by viewModel.allSites.collectAsState()
    val projects by viewModel.allProjects.collectAsState()
    var showCreateCustomer by rememberSaveable { mutableStateOf(false) }
    var addSiteForCustomerId by rememberSaveable { mutableStateOf<String?>(null) }

    val selectedCustomer = customers.firstOrNull { it.id == state.selectedCustomerId }

    Scaffold(
        floatingActionButton = {
            if (canWriteCustomers) {
                FloatingActionButton(onClick = { showCreateCustomer = true }) {
                    Icon(Icons.Outlined.Add, contentDescription = "New Customer")
                }
            }
        },
    ) { innerPadding ->
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            val isSplitLayout = maxWidth >= 720.dp

            if (isSplitLayout) {
                Row(modifier = Modifier.fillMaxSize()) {
                    CustomerListPane(
                        modifier = Modifier
                            .weight(0.45f)
                            .fillMaxHeight(),
                        state = state,
                        customers = customers,
                        onSearchChange = viewModel::updateSearch,
                        onRefresh = viewModel::refresh,
                        onSelectCustomer = { viewModel.selectCustomer(it.id) },
                    )
                    Column(
                        modifier = Modifier
                            .weight(0.55f)
                            .fillMaxHeight()
                            .padding(16.dp),
                    ) {
                        if (selectedCustomer != null) {
                            CustomerDetailPane(
                                customer = selectedCustomer,
                                sites = sites.filter { it.customerId == selectedCustomer.id },
                                projects = projects.filter { it.customerId == selectedCustomer.id },
                                canWrite = canWriteCustomers,
                                showBackButton = false,
                                onBack = { viewModel.selectCustomer(null) },
                                onAddSite = { addSiteForCustomerId = selectedCustomer.id },
                            )
                        } else {
                            VNexSurfaceCard {
                                Text(
                                    text = "Select a customer to inspect site locations and solar projects.",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.padding(16.dp),
                                )
                            }
                        }
                    }
                }
            } else if (selectedCustomer != null) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp),
                ) {
                    CustomerDetailPane(
                        customer = selectedCustomer,
                        sites = sites.filter { it.customerId == selectedCustomer.id },
                        projects = projects.filter { it.customerId == selectedCustomer.id },
                        canWrite = canWriteCustomers,
                        showBackButton = true,
                        onBack = { viewModel.selectCustomer(null) },
                        onAddSite = { addSiteForCustomerId = selectedCustomer.id },
                    )
                }
            } else {
                CustomerListPane(
                    modifier = Modifier.fillMaxSize(),
                    state = state,
                    customers = customers,
                    onSearchChange = viewModel::updateSearch,
                    onRefresh = viewModel::refresh,
                    onSelectCustomer = { viewModel.selectCustomer(it.id) },
                )
            }
        }
    }

    if (showCreateCustomer) {
        CreateCustomerDialog(
            isSaving = state.isSaving,
            onDismiss = { showCreateCustomer = false },
            onSubmit = { type, name, company, phone, email, address ->
                viewModel.createCustomer(
                    customerType = type,
                    fullName = name,
                    companyName = company,
                    phone = phone,
                    email = email,
                    billingAddress = address,
                    onDone = { showCreateCustomer = false },
                )
            },
        )
    }

    if (addSiteForCustomerId != null) {
        CreateSiteDialog(
            isSaving = state.isSaving,
            onDismiss = { addSiteForCustomerId = null },
            onSubmit = { siteName, addressLine, city, utility, meterRef, phase ->
                viewModel.createSite(
                    customerId = addSiteForCustomerId!!,
                    siteName = siteName,
                    addressLine = addressLine,
                    city = city,
                    utilityProvider = utility,
                    meterReference = meterRef,
                    connectionPhase = phase,
                    onDone = { addSiteForCustomerId = null },
                )
            },
        )
    }
}

@Composable
private fun CustomerListPane(
    modifier: Modifier,
    state: CustomersUiState,
    customers: List<CustomerEntity>,
    onSearchChange: (String) -> Unit,
    onRefresh: () -> Unit,
    onSelectCustomer: (CustomerEntity) -> Unit,
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
                placeholder = { Text("Search name, code, phone...") },
                leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier.weight(1f),
            )
            if (state.isRefreshing) {
                CircularProgressIndicator(modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
            } else {
                IconButton(onClick = onRefresh) {
                    Icon(Icons.Outlined.Refresh, contentDescription = "Refresh customers")
                }
            }
        }

        state.statusMessage?.let { msg ->
            Text(msg, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
        }
        state.errorMessage?.let { msg ->
            Text(msg, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
        }

        if (customers.isEmpty()) {
            VNexSurfaceCard {
                Text(
                    text = "No customers cached yet. Tap + to onboard a customer (works online or offline).",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(16.dp),
                )
            }
        } else {
            var visibleCount by rememberSaveable(state.searchQuery) { mutableIntStateOf(25) }
            val pageCustomers = remember(customers, visibleCount) { customers.take(visibleCount) }

            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(pageCustomers, key = { it.id }) { customer ->
                    VNexSurfaceCard(
                        modifier = Modifier.clickable { onSelectCustomer(customer) },
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
                                    text = customer.fullName,
                                    style = MaterialTheme.typography.titleMedium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f),
                                )
                                Text(
                                    text = "${customer.customerCode} · ${customer.syncState}",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                            }
                            Text(
                                text = listOfNotNull(
                                    customer.customerType.replaceFirstChar { it.uppercase() },
                                    customer.companyName,
                                    customer.primaryPhone,
                                ).joinToString(" · "),
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
                item {
                    VNexPaginationFooter(
                        loadedCount = pageCustomers.size,
                        totalCount = customers.size,
                        onLoadMore = { visibleCount += 25 },
                    )
                }
            }
        }
    }
}

@Composable
private fun CustomerDetailPane(
    customer: CustomerEntity,
    sites: List<SiteEntity>,
    projects: List<ProjectEntity>,
    canWrite: Boolean,
    showBackButton: Boolean,
    onBack: () -> Unit,
    onAddSite: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (showBackButton) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.Outlined.ArrowBack, contentDescription = "Back to customers")
                }
                Text(
                    text = customer.fullName,
                    style = MaterialTheme.typography.headlineMedium,
                )
            }
        } else {
            Text(
                text = customer.fullName,
                style = MaterialTheme.typography.headlineMedium,
            )
        }

        VNexSurfaceCard {
            Column(modifier = Modifier.padding(14.dp)) {
                VNexMetricRow("Customer Code", customer.customerCode)
                VNexMetricRow("Segment", customer.customerType)
                VNexMetricRow("Company", customer.companyName ?: "-")
                VNexMetricRow("Phone", customer.primaryPhone ?: "-")
                VNexMetricRow("Email", customer.email ?: "-")
                VNexMetricRow("Address", customer.billingAddress ?: "-", showDivider = false)
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text("Sites (${sites.size})", style = MaterialTheme.typography.titleMedium)
            if (canWrite) {
                OutlinedButton(onClick = onAddSite) {
                    Text("Add Site")
                }
            }
        }

        if (sites.isEmpty()) {
            VNexSurfaceCard {
                Text(
                    text = "No installation sites registered yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(14.dp),
                )
            }
        } else {
            sites.forEach { site ->
                VNexSurfaceCard {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text(site.siteName, style = MaterialTheme.typography.titleMedium)
                        Text(
                            text = "${site.addressLine}, ${site.city}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            text = "Phase: ${site.connectionPhase} · Utility: ${site.utilityProvider ?: "N/A"}",
                            style = MaterialTheme.typography.labelMedium,
                        )
                    }
                }
            }
        }

        Text("Projects (${projects.size})", style = MaterialTheme.typography.titleMedium)
        if (projects.isEmpty()) {
            VNexSurfaceCard {
                Text(
                    text = "No projects linked to this customer yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(14.dp),
                )
            }
        } else {
            projects.forEach { project ->
                VNexSurfaceCard {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        Text("${project.projectCode} · ${project.title}", style = MaterialTheme.typography.titleMedium)
                        Text(
                            text = "Stage: ${project.currentStage} · ${project.systemType}",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun CreateCustomerDialog(
    isSaving: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (String, String, String?, String?, String?, String?) -> Unit,
) {
    var type by remember { mutableStateOf("residential") }
    var name by remember { mutableStateOf("") }
    var company by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New Customer") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("residential", "commercial", "industrial", "agricultural").forEach { seg ->
                        FilterChip(
                            selected = type == seg,
                            onClick = { type = seg },
                            label = { Text(seg.replaceFirstChar { it.uppercase() }) },
                        )
                    }
                }
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Full Name *") }, singleLine = true)
                OutlinedTextField(value = company, onValueChange = { company = it }, label = { Text("Company (optional)") }, singleLine = true)
                OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text("Phone (+92...)") }, singleLine = true)
                OutlinedTextField(value = email, onValueChange = { email = it }, label = { Text("Email") }, singleLine = true)
                OutlinedTextField(value = address, onValueChange = { address = it }, label = { Text("Billing Address") })
            }
        },
        confirmButton = {
            Button(
                enabled = !isSaving && name.trim().length >= 2,
                onClick = { onSubmit(type, name, company, phone, email, address) },
            ) {
                Text(if (isSaving) "Saving..." else "Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}

@Composable
private fun CreateSiteDialog(
    isSaving: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (String, String, String, String?, String?, String) -> Unit,
) {
    var siteName by remember { mutableStateOf("") }
    var addressLine by remember { mutableStateOf("") }
    var city by remember { mutableStateOf("") }
    var utility by remember { mutableStateOf("LESCO") }
    var meterRef by remember { mutableStateOf("") }
    var phase by remember { mutableStateOf("three") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Installation Site") },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(value = siteName, onValueChange = { siteName = it }, label = { Text("Site Name *") }, singleLine = true)
                OutlinedTextField(value = addressLine, onValueChange = { addressLine = it }, label = { Text("Address Line *") })
                OutlinedTextField(value = city, onValueChange = { city = it }, label = { Text("City *") }, singleLine = true)
                OutlinedTextField(value = utility, onValueChange = { utility = it }, label = { Text("Utility (LESCO/MEPCO/KE)") }, singleLine = true)
                OutlinedTextField(value = meterRef, onValueChange = { meterRef = it }, label = { Text("Meter Reference") }, singleLine = true)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("single", "three").forEach { p ->
                        FilterChip(
                            selected = phase == p,
                            onClick = { phase = p },
                            label = { Text("${p.replaceFirstChar { it.uppercase() }} Phase") },
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                enabled = !isSaving && siteName.trim().length >= 2 && addressLine.trim().length >= 3 && city.trim().length >= 2,
                onClick = { onSubmit(siteName, addressLine, city, utility, meterRef, phase) },
            ) {
                Text(if (isSaving) "Saving..." else "Add Site")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    )
}
