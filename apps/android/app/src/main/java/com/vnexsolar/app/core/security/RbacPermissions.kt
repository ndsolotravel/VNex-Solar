package com.vnexsolar.app.core.security

enum class UserRole(val apiValue: String, val label: String) {
    ORG_OWNER("ORG_OWNER", "Organization Owner"),
    COMPANY_MANAGER("COMPANY_MANAGER", "Company Manager"),
    SOLAR_ENGINEER("SOLAR_ENGINEER", "Solar Engineer"),
    SALES_EXECUTIVE("SALES_EXECUTIVE", "Sales Executive"),
    INSTALLATION_SUPERVISOR("INSTALLATION_SUPERVISOR", "Installation Supervisor"),
    SAFETY_OFFICER("SAFETY_OFFICER", "Safety Officer"),
    FINANCE_OFFICER("FINANCE_OFFICER", "Finance Officer"),
    FIELD_TECHNICIAN("FIELD_TECHNICIAN", "Field Technician"),
    CUSTOMER("CUSTOMER", "Customer");

    companion object {
        fun fromApi(raw: String?): UserRole =
            entries.firstOrNull { it.apiValue == raw } ?: FIELD_TECHNICIAN
    }
}

enum class PermissionKey(val key: String) {
    ORG_MANAGE("org:manage"),
    USERS_MANAGE("users:manage"),
    CUSTOMERS_READ("customers:read"),
    CUSTOMERS_WRITE("customers:write"),
    SURVEYS_READ("surveys:read"),
    SURVEYS_WRITE("surveys:write"),
    ENGINEERING_READ("engineering:read"),
    ENGINEERING_WRITE("engineering:write"),
    ENGINEERING_APPROVE("engineering:approve"),
    INVENTORY_READ("inventory:read"),
    INVENTORY_TRANSACT("inventory:transact"),
    QUOTATIONS_READ("quotations:read"),
    QUOTATIONS_WRITE("quotations:write"),
    QUOTATIONS_APPROVE("quotations:approve"),
    FINANCE_READ("finance:read"),
    FINANCE_POST("finance:post"),
    INSTALLATION_READ("installation:read"),
    INSTALLATION_UPDATE_ASSIGNED("installation:update_assigned"),
    INSTALLATION_MANAGE("installation:manage"),
    SAFETY_READ("safety:read"),
    SAFETY_WRITE("safety:write"),
    SAFETY_APPROVE("safety:approve"),
    COMMISSIONING_READ("commissioning:read"),
    COMMISSIONING_APPROVE("commissioning:approve"),
    MAINTENANCE_READ("maintenance:read"),
    MAINTENANCE_WRITE("maintenance:write"),
    INFRASTRUCTURE_READ("infrastructure:read"),
}

object RbacPermissions {
    private val rolePermissions: Map<UserRole, Set<PermissionKey>> = mapOf(
        UserRole.ORG_OWNER to PermissionKey.entries.toSet(),
        UserRole.COMPANY_MANAGER to setOf(
            PermissionKey.USERS_MANAGE,
            PermissionKey.CUSTOMERS_READ,
            PermissionKey.CUSTOMERS_WRITE,
            PermissionKey.SURVEYS_READ,
            PermissionKey.SURVEYS_WRITE,
            PermissionKey.ENGINEERING_READ,
            PermissionKey.INVENTORY_READ,
            PermissionKey.INVENTORY_TRANSACT,
            PermissionKey.QUOTATIONS_READ,
            PermissionKey.QUOTATIONS_WRITE,
            PermissionKey.QUOTATIONS_APPROVE,
            PermissionKey.FINANCE_READ,
            PermissionKey.INSTALLATION_READ,
            PermissionKey.INSTALLATION_MANAGE,
            PermissionKey.SAFETY_READ,
            PermissionKey.COMMISSIONING_READ,
            PermissionKey.MAINTENANCE_READ,
            PermissionKey.MAINTENANCE_WRITE,
            PermissionKey.INFRASTRUCTURE_READ,
        ),
        UserRole.SOLAR_ENGINEER to setOf(
            PermissionKey.CUSTOMERS_READ,
            PermissionKey.SURVEYS_READ,
            PermissionKey.SURVEYS_WRITE,
            PermissionKey.ENGINEERING_READ,
            PermissionKey.ENGINEERING_WRITE,
            PermissionKey.ENGINEERING_APPROVE,
            PermissionKey.INVENTORY_READ,
            PermissionKey.QUOTATIONS_READ,
            PermissionKey.INSTALLATION_READ,
            PermissionKey.SAFETY_READ,
            PermissionKey.COMMISSIONING_READ,
            PermissionKey.COMMISSIONING_APPROVE,
            PermissionKey.MAINTENANCE_READ,
        ),
        UserRole.SALES_EXECUTIVE to setOf(
            PermissionKey.CUSTOMERS_READ,
            PermissionKey.CUSTOMERS_WRITE,
            PermissionKey.SURVEYS_READ,
            PermissionKey.SURVEYS_WRITE,
            PermissionKey.ENGINEERING_READ,
            PermissionKey.INVENTORY_READ,
            PermissionKey.QUOTATIONS_READ,
            PermissionKey.QUOTATIONS_WRITE,
        ),
        UserRole.INSTALLATION_SUPERVISOR to setOf(
            PermissionKey.CUSTOMERS_READ,
            PermissionKey.SURVEYS_READ,
            PermissionKey.ENGINEERING_READ,
            PermissionKey.INVENTORY_READ,
            PermissionKey.INVENTORY_TRANSACT,
            PermissionKey.INSTALLATION_READ,
            PermissionKey.INSTALLATION_UPDATE_ASSIGNED,
            PermissionKey.INSTALLATION_MANAGE,
            PermissionKey.SAFETY_READ,
            PermissionKey.SAFETY_WRITE,
            PermissionKey.COMMISSIONING_READ,
            PermissionKey.MAINTENANCE_READ,
        ),
        UserRole.SAFETY_OFFICER to setOf(
            PermissionKey.CUSTOMERS_READ,
            PermissionKey.SURVEYS_READ,
            PermissionKey.ENGINEERING_READ,
            PermissionKey.INSTALLATION_READ,
            PermissionKey.SAFETY_READ,
            PermissionKey.SAFETY_WRITE,
            PermissionKey.SAFETY_APPROVE,
            PermissionKey.COMMISSIONING_READ,
            PermissionKey.MAINTENANCE_READ,
        ),
        UserRole.FINANCE_OFFICER to setOf(
            PermissionKey.CUSTOMERS_READ,
            PermissionKey.QUOTATIONS_READ,
            PermissionKey.QUOTATIONS_APPROVE,
            PermissionKey.FINANCE_READ,
            PermissionKey.FINANCE_POST,
            PermissionKey.INVENTORY_READ,
            PermissionKey.MAINTENANCE_READ,
            PermissionKey.INFRASTRUCTURE_READ,
        ),
        UserRole.FIELD_TECHNICIAN to setOf(
            PermissionKey.CUSTOMERS_READ,
            PermissionKey.SURVEYS_READ,
            PermissionKey.SURVEYS_WRITE,
            PermissionKey.INSTALLATION_READ,
            PermissionKey.INSTALLATION_UPDATE_ASSIGNED,
            PermissionKey.SAFETY_READ,
            PermissionKey.SAFETY_WRITE,
            PermissionKey.MAINTENANCE_READ,
            PermissionKey.MAINTENANCE_WRITE,
        ),
        UserRole.CUSTOMER to setOf(
            PermissionKey.QUOTATIONS_READ,
            PermissionKey.FINANCE_READ,
            PermissionKey.COMMISSIONING_READ,
            PermissionKey.MAINTENANCE_READ,
            PermissionKey.MAINTENANCE_WRITE,
        ),
    )

    fun hasPermission(role: UserRole, permission: PermissionKey): Boolean =
        rolePermissions[role]?.contains(permission) == true

    fun hasAnyPermission(role: UserRole, vararg permissions: PermissionKey): Boolean =
        permissions.any { hasPermission(role, it) }

    fun permissionsFor(role: UserRole): Set<PermissionKey> =
        rolePermissions[role].orEmpty()
}
