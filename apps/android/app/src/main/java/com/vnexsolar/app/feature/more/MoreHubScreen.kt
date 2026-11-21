package com.vnexsolar.app.feature.more

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Assessment
import androidx.compose.material.icons.outlined.Badge
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.CloudSync
import androidx.compose.material.icons.outlined.Engineering
import androidx.compose.material.icons.outlined.HealthAndSafety
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.LocalShipping
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.QrCodeScanner
import androidx.compose.material.icons.outlined.RequestQuote
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Verified
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.vnexsolar.app.core.designsystem.VNexSurfaceCard
import com.vnexsolar.app.core.navigation.VNexRoutes
import com.vnexsolar.app.core.security.PermissionKey
import com.vnexsolar.app.core.security.RbacPermissions
import com.vnexsolar.app.core.security.UserRole

data class MoreModuleItem(
    val route: String,
    val title: String,
    val subtitle: String,
    val icon: ImageVector,
    val requiredPermission: PermissionKey? = null,
)

@Composable
fun MoreHubScreen(
    activeRole: UserRole,
    organizationName: String,
    userFullName: String,
    pendingOutboxCount: Int,
    onNavigate: (String) -> Unit,
) {
    val allModules = listOf(
        MoreModuleItem(
            route = VNexRoutes.ENGINEERING,
            title = "Solar Engineering",
            subtitle = "Sizing, MPPT, cable & ROI",
            icon = Icons.Outlined.Engineering,
            requiredPermission = PermissionKey.ENGINEERING_READ,
        ),
        MoreModuleItem(
            route = VNexRoutes.QUOTATIONS,
            title = "Quotations",
            subtitle = "Proposals, taxes & PDF",
            icon = Icons.Outlined.RequestQuote,
            requiredPermission = PermissionKey.QUOTATIONS_READ,
        ),
        MoreModuleItem(
            route = VNexRoutes.INVENTORY,
            title = "Inventory",
            subtitle = "Stock levels, serials & QR",
            icon = Icons.Outlined.Inventory2,
            requiredPermission = PermissionKey.INVENTORY_READ,
        ),
        MoreModuleItem(
            route = VNexRoutes.SUPPLIERS,
            title = "Suppliers & POs",
            subtitle = "Procurement & receipts",
            icon = Icons.Outlined.LocalShipping,
            requiredPermission = PermissionKey.INVENTORY_READ,
        ),
        MoreModuleItem(
            route = VNexRoutes.SURVEYS,
            title = "Site Surveys",
            subtitle = "Roofs, loads & photos",
            icon = Icons.Outlined.PhotoCamera,
            requiredPermission = PermissionKey.SURVEYS_READ,
        ),
        MoreModuleItem(
            route = VNexRoutes.INSTALLATIONS,
            title = "Installations",
            subtitle = "Crew jobs & site logs",
            icon = Icons.Outlined.Build,
            requiredPermission = PermissionKey.INSTALLATION_READ,
        ),
        MoreModuleItem(
            route = VNexRoutes.SAFETY,
            title = "Safety Checks",
            subtitle = "PPE, height & isolation",
            icon = Icons.Outlined.HealthAndSafety,
            requiredPermission = PermissionKey.SAFETY_READ,
        ),
        MoreModuleItem(
            route = VNexRoutes.COMMISSIONING,
            title = "Commissioning",
            subtitle = "Tests, net metering & signoff",
            icon = Icons.Outlined.Verified,
            requiredPermission = PermissionKey.COMMISSIONING_READ,
        ),
        MoreModuleItem(
            route = VNexRoutes.MAINTENANCE,
            title = "Maintenance & QR",
            subtitle = "Tickets, warranty & scan",
            icon = Icons.Outlined.QrCodeScanner,
            requiredPermission = PermissionKey.MAINTENANCE_READ,
        ),
        MoreModuleItem(
            route = VNexRoutes.REPORTS,
            title = "Reports & P&L",
            subtitle = "Sales, receivables & ledger",
            icon = Icons.Outlined.Assessment,
            requiredPermission = PermissionKey.FINANCE_READ,
        ),
        MoreModuleItem(
            route = VNexRoutes.SYNC_QUEUE,
            title = "Offline Sync",
            subtitle = "$pendingOutboxCount pending operation(s)",
            icon = Icons.Outlined.CloudSync,
        ),
        MoreModuleItem(
            route = VNexRoutes.EMPLOYEES,
            title = "Team & Roles",
            subtitle = "Staff & access permissions",
            icon = Icons.Outlined.Badge,
            requiredPermission = PermissionKey.USERS_MANAGE,
        ),
        MoreModuleItem(
            route = VNexRoutes.SETTINGS,
            title = "Settings",
            subtitle = "Currency, biometric & server",
            icon = Icons.Outlined.Settings,
        ),
    )

    val visibleModules = allModules.filter { item ->
        item.requiredPermission == null || RbacPermissions.hasPermission(activeRole, item.requiredPermission)
    }

    LazyVerticalGrid(
        columns = GridCells.Adaptive(minSize = 160.dp),
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(span = { GridItemSpan(maxLineSpan) }) {
            VNexSurfaceCard {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = organizationName.ifBlank { "VNex Solar Workspace" },
                        style = MaterialTheme.typography.titleMedium,
                    )
                    Text(
                        text = "${userFullName.ifBlank { "Signed-in User" }} · ${activeRole.label}",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }

        items(visibleModules, key = { it.route }) { module ->
            VNexSurfaceCard(
                modifier = Modifier.clickable { onNavigate(module.route) },
            ) {
                Column(
                    modifier = Modifier.padding(14.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = module.icon,
                            contentDescription = module.title,
                            tint = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.size(22.dp),
                        )
                    }
                    Text(
                        text = module.title,
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        text = module.subtitle,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
    }
}
