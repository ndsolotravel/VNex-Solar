package com.vnexsolar.app.core.navigation

import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.Assignment
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.GridView
import androidx.compose.material.icons.outlined.People
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.vnexsolar.app.core.preferences.AppPreferences
import com.vnexsolar.app.core.security.PermissionKey
import com.vnexsolar.app.core.security.RbacPermissions
import com.vnexsolar.app.core.security.UserRole
import com.vnexsolar.app.feature.commissioning.CommissioningScreen
import com.vnexsolar.app.feature.customers.CustomersScreen
import com.vnexsolar.app.feature.dashboard.FieldHomeScreen
import com.vnexsolar.app.feature.employees.EmployeesScreen
import com.vnexsolar.app.feature.engineering.SolarEngineeringScreen
import com.vnexsolar.app.feature.finance.FinanceScreen
import com.vnexsolar.app.feature.installations.InstallationTasksScreen
import com.vnexsolar.app.feature.inventory.InventoryScreen
import com.vnexsolar.app.feature.inventory.SuppliersScreen
import com.vnexsolar.app.feature.maintenance.MaintenanceWarrantyScreen
import com.vnexsolar.app.feature.more.MoreHubScreen
import com.vnexsolar.app.feature.projects.ProjectsScreen
import com.vnexsolar.app.feature.quotations.QuotationsScreen
import com.vnexsolar.app.feature.reports.ReportsScreen
import com.vnexsolar.app.feature.safety.SafetyInspectionScreen
import com.vnexsolar.app.feature.settings.SettingsScreen
import com.vnexsolar.app.feature.surveys.SiteSurveyScreen
import com.vnexsolar.app.feature.sync.SyncQueueScreen

object VNexRoutes {
    const val DASHBOARD = "dashboard"
    const val PROJECTS = "projects"
    const val CUSTOMERS = "customers"
    const val FINANCE = "finance"
    const val MORE = "more"

    const val SURVEYS = "surveys"
    const val ENGINEERING = "engineering"
    const val QUOTATIONS = "quotations"
    const val INVENTORY = "inventory"
    const val SUPPLIERS = "suppliers"
    const val INSTALLATIONS = "installations"
    const val SAFETY = "safety"
    const val COMMISSIONING = "commissioning"
    const val MAINTENANCE = "maintenance"
    const val REPORTS = "reports"
    const val SYNC_QUEUE = "sync"
    const val EMPLOYEES = "employees"
    const val SETTINGS = "settings"
}

sealed class VNexRoute(
    val route: String,
    val label: String,
    val phaseNote: String,
    val icon: ImageVector,
) {
    data object Dashboard : VNexRoute(VNexRoutes.DASHBOARD, "Dashboard", "Phase 3", Icons.Outlined.Dashboard)
    data object Projects : VNexRoute(VNexRoutes.PROJECTS, "Projects", "Phase 3", Icons.Outlined.Assignment)
    data object Customers : VNexRoute(VNexRoutes.CUSTOMERS, "Customers", "Phase 3", Icons.Outlined.People)
    data object Finance : VNexRoute(VNexRoutes.FINANCE, "Finance", "Phase 5", Icons.Outlined.AccountBalanceWallet)
    data object More : VNexRoute(VNexRoutes.MORE, "More", "Phase 2", Icons.Outlined.GridView)
}

val PRIMARY_DESTINATIONS = listOf(
    VNexRoute.Dashboard,
    VNexRoute.Projects,
    VNexRoute.Customers,
    VNexRoute.Finance,
    VNexRoute.More,
)

private val MODULE_TITLES = mapOf(
    VNexRoutes.DASHBOARD to "VNex Solar",
    VNexRoutes.PROJECTS to "Projects",
    VNexRoutes.CUSTOMERS to "Customers",
    VNexRoutes.FINANCE to "Finance",
    VNexRoutes.MORE to "More Modules",
    VNexRoutes.SURVEYS to "Site Surveys",
    VNexRoutes.ENGINEERING to "Solar Engineering",
    VNexRoutes.QUOTATIONS to "Quotations",
    VNexRoutes.INVENTORY to "Inventory",
    VNexRoutes.SUPPLIERS to "Suppliers & POs",
    VNexRoutes.INSTALLATIONS to "Installations",
    VNexRoutes.SAFETY to "Safety Inspections",
    VNexRoutes.COMMISSIONING to "Commissioning",
    VNexRoutes.MAINTENANCE to "Maintenance & QR",
    VNexRoutes.REPORTS to "Reports & P&L",
    VNexRoutes.SYNC_QUEUE to "Offline Sync Queue",
    VNexRoutes.EMPLOYEES to "Team & RBAC",
    VNexRoutes.SETTINGS to "Settings",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VNexNavHost(
    appPreferences: AppPreferences,
    organizationName: String,
    userEmail: String,
    userFullName: String,
    activeRole: UserRole,
    pendingOutboxCount: Int,
    isOnline: Boolean,
    isDarkTheme: Boolean,
    canUseBiometrics: Boolean,
    onToggleTheme: () -> Unit,
    onSignOut: () -> Unit,
) {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination
    val currentRoute = currentDestination?.route ?: VNexRoutes.DASHBOARD
    val isPrimaryDestination = PRIMARY_DESTINATIONS.any { it.route == currentRoute }

    val navigatePrimary: (String) -> Unit = { route ->
        navController.navigate(route) {
            popUpTo(navController.graph.findStartDestination().id) {
                saveState = true
            }
            launchSingleTop = true
            restoreState = true
        }
    }

    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
        val useNavigationRail = maxWidth >= 600.dp

        Scaffold(
            topBar = {
                TopAppBar(
                    navigationIcon = {
                        if (!isPrimaryDestination) {
                            IconButton(onClick = { navController.popBackStack() }) {
                                Icon(
                                    imageVector = Icons.AutoMirrored.Outlined.ArrowBack,
                                    contentDescription = "Back",
                                )
                            }
                        }
                    },
                    title = {
                        Text(
                            text = MODULE_TITLES[currentRoute] ?: "VNex Solar",
                            style = MaterialTheme.typography.titleMedium,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                    },
                    actions = {
                        TextButton(onClick = onToggleTheme) {
                            Text(text = if (isDarkTheme) "Light" else "Dark")
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface,
                        titleContentColor = MaterialTheme.colorScheme.onSurface,
                    ),
                )
            },
            bottomBar = {
                if (!useNavigationRail) {
                    NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                        PRIMARY_DESTINATIONS.forEach { destination ->
                            val selected = currentDestination?.hierarchy?.any { it.route == destination.route } == true
                            NavigationBarItem(
                                selected = selected,
                                onClick = { navigatePrimary(destination.route) },
                                icon = { Icon(destination.icon, contentDescription = destination.label) },
                                label = {
                                    Text(
                                        text = destination.label,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                },
                            )
                        }
                    }
                }
            },
        ) { innerPadding ->
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
            ) {
                if (useNavigationRail) {
                    NavigationRail(
                        containerColor = MaterialTheme.colorScheme.surface,
                        modifier = Modifier.fillMaxHeight(),
                    ) {
                        PRIMARY_DESTINATIONS.forEach { destination ->
                            val selected = currentDestination?.hierarchy?.any { it.route == destination.route } == true
                            NavigationRailItem(
                                selected = selected,
                                onClick = { navigatePrimary(destination.route) },
                                icon = { Icon(destination.icon, contentDescription = destination.label) },
                                label = {
                                    Text(
                                        text = destination.label,
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                },
                            )
                        }
                    }
                }

                NavHost(
                    navController = navController,
                    startDestination = VNexRoute.Dashboard.route,
                    modifier = Modifier.weight(1f),
                    enterTransition = { fadeIn(animationSpec = tween(180)) },
                    exitTransition = { fadeOut(animationSpec = tween(140)) },
                    popEnterTransition = { fadeIn(animationSpec = tween(180)) },
                    popExitTransition = { fadeOut(animationSpec = tween(140)) },
                ) {
                    composable(VNexRoutes.DASHBOARD) {
                        FieldHomeScreen(
                            pendingOutboxCount = pendingOutboxCount,
                            isOnline = isOnline,
                            onNavigate = { route -> navController.navigate(route) },
                        )
                    }
                    composable(VNexRoutes.PROJECTS) {
                        ProjectsScreen(
                            canWriteProjects = RbacPermissions.hasPermission(activeRole, PermissionKey.CUSTOMERS_WRITE),
                            onNavigate = { route -> navController.navigate(route) },
                        )
                    }
                    composable(VNexRoutes.CUSTOMERS) {
                        CustomersScreen(
                            canWriteCustomers = RbacPermissions.hasPermission(activeRole, PermissionKey.CUSTOMERS_WRITE),
                        )
                    }
                    composable(VNexRoutes.FINANCE) {
                        FinanceScreen(
                            canPostFinance = RbacPermissions.hasPermission(activeRole, PermissionKey.FINANCE_POST),
                        )
                    }
                    composable(VNexRoutes.MORE) {
                        MoreHubScreen(
                            activeRole = activeRole,
                            organizationName = organizationName,
                            userFullName = userFullName,
                            pendingOutboxCount = pendingOutboxCount,
                            onNavigate = { route -> navController.navigate(route) },
                        )
                    }
                    composable(VNexRoutes.SURVEYS) { SiteSurveyScreen() }
                    composable(VNexRoutes.ENGINEERING) {
                        SolarEngineeringScreen(
                            canWriteEngineering = RbacPermissions.hasPermission(activeRole, PermissionKey.ENGINEERING_WRITE),
                            canApproveEngineering = RbacPermissions.hasPermission(activeRole, PermissionKey.ENGINEERING_APPROVE),
                        )
                    }
                    composable(VNexRoutes.INSTALLATIONS) { InstallationTasksScreen() }
                    composable(VNexRoutes.SAFETY) { SafetyInspectionScreen() }
                    composable(VNexRoutes.MAINTENANCE) { MaintenanceWarrantyScreen() }
                    composable(VNexRoutes.SETTINGS) {
                        SettingsScreen(
                            appPreferences = appPreferences,
                            organizationName = organizationName,
                            userEmail = userEmail,
                            userFullName = userFullName,
                            role = activeRole,
                            isDarkTheme = isDarkTheme,
                            canUseBiometrics = canUseBiometrics,
                            onToggleTheme = onToggleTheme,
                            onSignOut = onSignOut,
                        )
                    }
                    composable(VNexRoutes.QUOTATIONS) {
                        QuotationsScreen(
                            canWriteQuotations = RbacPermissions.hasPermission(activeRole, PermissionKey.QUOTATIONS_WRITE),
                            canApproveQuotations = RbacPermissions.hasPermission(activeRole, PermissionKey.QUOTATIONS_APPROVE),
                            canPostFinance = RbacPermissions.hasPermission(activeRole, PermissionKey.FINANCE_POST),
                        )
                    }
                    composable(VNexRoutes.INVENTORY) {
                        InventoryScreen(
                            canTransactInventory = RbacPermissions.hasPermission(activeRole, PermissionKey.INVENTORY_TRANSACT),
                        )
                    }
                    composable(VNexRoutes.SUPPLIERS) {
                        SuppliersScreen(
                            canTransactInventory = RbacPermissions.hasPermission(activeRole, PermissionKey.INVENTORY_TRANSACT),
                        )
                    }
                    composable(VNexRoutes.COMMISSIONING) {
                        CommissioningScreen(
                            canApproveCommissioning = RbacPermissions.hasPermission(activeRole, PermissionKey.COMMISSIONING_APPROVE),
                            canManageInstallation = RbacPermissions.hasAnyPermission(
                                activeRole,
                                PermissionKey.COMMISSIONING_APPROVE,
                                PermissionKey.INSTALLATION_MANAGE,
                            ),
                        )
                    }
                    composable(VNexRoutes.REPORTS) {
                        ReportsScreen()
                    }
                    composable(VNexRoutes.SYNC_QUEUE) {
                        SyncQueueScreen(
                            canResolveConflicts = activeRole != UserRole.CUSTOMER,
                        )
                    }
                    composable(VNexRoutes.EMPLOYEES) {
                        EmployeesScreen()
                    }
                }
            }
        }
    }
}
