package com.vnexsolar.app.core.navigation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.Engineering
import androidx.compose.material.icons.outlined.HealthAndSafety
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.vnexsolar.app.core.designsystem.VNexSurfaceCard
import com.vnexsolar.app.feature.dashboard.FieldHomeScreen
import com.vnexsolar.app.feature.engineering.SolarEngineeringScreen
import com.vnexsolar.app.feature.installations.InstallationTasksScreen
import com.vnexsolar.app.feature.maintenance.MaintenanceWarrantyScreen
import com.vnexsolar.app.feature.safety.SafetyInspectionScreen
import com.vnexsolar.app.feature.surveys.SiteSurveyScreen

sealed class VNexRoute(
    val route: String,
    val label: String,
    val phaseNote: String,
    val icon: ImageVector,
) {
    data object Home : VNexRoute("home", "Home", "Phase 1", Icons.Outlined.Dashboard)
    data object Surveys : VNexRoute("surveys", "Surveys", "Phase 5", Icons.Outlined.PhotoCamera)
    data object Engineering : VNexRoute("engineering", "Solar Calc", "Phase 6", Icons.Outlined.Engineering)
    data object FieldWork : VNexRoute("installations", "Tasks", "Phase 9", Icons.Outlined.Build)
    data object Safety : VNexRoute("safety", "Safety", "Phase 10", Icons.Outlined.HealthAndSafety)
    data object SyncQueue : VNexRoute("sync", "Sync", "Phase 4", Icons.Outlined.Sync)
}

val PRIMARY_DESTINATIONS = listOf(
    VNexRoute.Home,
    VNexRoute.Surveys,
    VNexRoute.Engineering,
    VNexRoute.FieldWork,
    VNexRoute.Safety,
    VNexRoute.SyncQueue,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VNexNavHost(
    isDarkTheme: Boolean,
    onToggleTheme: () -> Unit,
) {
    val navController = rememberNavController()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = backStackEntry?.destination

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "VNex Solar",
                        style = MaterialTheme.typography.titleMedium,
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
            NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                PRIMARY_DESTINATIONS.forEach { destination ->
                    val selected = currentDestination?.hierarchy?.any { it.route == destination.route } == true
                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            navController.navigate(destination.route) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(destination.icon, contentDescription = destination.label) },
                        label = { Text(destination.label, maxLines = 1) },
                    )
                }
            }
        },
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = VNexRoute.Home.route,
            modifier = Modifier.padding(innerPadding),
        ) {
            composable(VNexRoute.Home.route) {
                FieldHomeScreen(
                    onNavigate = { route -> navController.navigate(route) },
                )
            }
            composable(VNexRoute.Surveys.route) {
                SiteSurveyScreen()
            }
            composable(VNexRoute.Engineering.route) {
                SolarEngineeringScreen()
            }
            composable(VNexRoute.FieldWork.route) {
                InstallationTasksScreen()
            }
            composable(VNexRoute.Safety.route) {
                SafetyInspectionScreen()
            }
            composable("maintenance") {
                MaintenanceWarrantyScreen()
            }
            PRIMARY_DESTINATIONS.filter {
                it != VNexRoute.Home &&
                    it != VNexRoute.Surveys &&
                    it != VNexRoute.Engineering &&
                    it != VNexRoute.FieldWork &&
                    it != VNexRoute.Safety
            }.forEach { route ->
                composable(route.route) {
                    ModuleFoundationPlaceholder(route = route)
                }
            }
        }
    }
}

@Composable
private fun ModuleFoundationPlaceholder(route: VNexRoute) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = route.label,
            style = MaterialTheme.typography.headlineMedium,
        )
        VNexSurfaceCard {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Text(
                    text = "Navigation destination wired (${route.phaseNote})",
                    style = MaterialTheme.typography.titleMedium,
                )
                Text(
                    text = "Room offline repositories and WorkManager sync contracts for ${route.label} will be bound sequentially in ${route.phaseNote}.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
