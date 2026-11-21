package com.vnexsolar.app

import com.vnexsolar.app.core.model.DomainConstants
import com.vnexsolar.app.core.model.PaymentMethodOption
import com.vnexsolar.app.core.security.PermissionKey
import com.vnexsolar.app.core.security.RbacPermissions
import com.vnexsolar.app.core.security.UserRole
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RbacAndCurrencyTest {

    @Test
    fun supportsAllNineRolesAndAllTwentySevenPermissionsForOwner() {
        assertEquals(9, UserRole.entries.size)
        assertEquals(27, PermissionKey.entries.size)
        assertEquals(27, RbacPermissions.permissionsFor(UserRole.ORG_OWNER).size)
    }

    @Test
    fun enforcesRoleBoundariesConsistentWithBackend() {
        assertTrue(RbacPermissions.hasPermission(UserRole.FINANCE_OFFICER, PermissionKey.FINANCE_POST))
        assertFalse(RbacPermissions.hasPermission(UserRole.FINANCE_OFFICER, PermissionKey.ENGINEERING_APPROVE))
        assertFalse(RbacPermissions.hasPermission(UserRole.SALES_EXECUTIVE, PermissionKey.QUOTATIONS_APPROVE))
        assertTrue(RbacPermissions.hasPermission(UserRole.SAFETY_OFFICER, PermissionKey.SAFETY_APPROVE))
        assertFalse(RbacPermissions.hasPermission(UserRole.SAFETY_OFFICER, PermissionKey.FINANCE_POST))
        assertTrue(RbacPermissions.hasPermission(UserRole.FIELD_TECHNICIAN, PermissionKey.SURVEYS_WRITE))
        assertFalse(RbacPermissions.hasPermission(UserRole.CUSTOMER, PermissionKey.CUSTOMERS_WRITE))
    }

    @Test
    fun supportsPkrAndInternationalCurrenciesIncludingSar() {
        val codes = DomainConstants.SUPPORTED_CURRENCIES.map { it.code }
        assertEquals(listOf("PKR", "USD", "AED", "SAR", "EUR", "GBP"), codes)
        assertEquals("Rs 12,500", DomainConstants.formatMinorCurrency(1_250_000L, "PKR"))
        assertEquals("SAR 450.5", DomainConstants.formatMinorCurrency(45_050L, "SAR"))
    }

    @Test
    fun supportsRecordablePakistanPaymentMethods() {
        val apiValues = PaymentMethodOption.entries.map { it.apiValue }.toSet()
        assertTrue("cash" in apiValues)
        assertTrue("bank_transfer" in apiValues)
        assertTrue("jazzcash" in apiValues)
        assertTrue("easypaisa" in apiValues)
    }
}
