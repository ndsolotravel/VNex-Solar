package com.vnexsolar.app

import com.vnexsolar.app.core.model.DomainConstants
import com.vnexsolar.app.core.network.ApiUrlValidator
import com.vnexsolar.app.core.security.PermissionKey
import com.vnexsolar.app.core.security.RbacPermissions
import com.vnexsolar.app.core.security.UserRole
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ApiUrlValidatorAndSecurityTest {

    @Test
    fun releaseModeBlocksCleartextHttpEvenForLoopback() {
        val localHttp = ApiUrlValidator.validate("http://10.0.2.2:3000", allowDebugCleartext = false)
        assertFalse(localHttp.isValid)

        val publicHttp = ApiUrlValidator.validate("http://api.vnexsolar.com", allowDebugCleartext = false)
        assertFalse(publicHttp.isValid)
    }

    @Test
    fun debugModeAllowsLocalEmulatorHttpOnlyAndBlocksPublicHttp() {
        val emulator = ApiUrlValidator.validate("http://10.0.2.2:3000", allowDebugCleartext = true)
        assertTrue(emulator.isValid)
        assertEquals("http://10.0.2.2:3000/", emulator.normalizedUrl)

        val publicHttp = ApiUrlValidator.validate("http://example.com", allowDebugCleartext = true)
        assertFalse(publicHttp.isValid)
    }

    @Test
    fun acceptsValidHttpsAndRejectsUnsafeSchemesOrEmbeddedCredentials() {
        val valid = ApiUrlValidator.validate("https://api.vnexsolar.com", allowDebugCleartext = false)
        assertTrue(valid.isValid)
        assertEquals("https://api.vnexsolar.com/", valid.normalizedUrl)

        val jsScheme = ApiUrlValidator.validate("javascript:alert(1)", allowDebugCleartext = true)
        assertFalse(jsScheme.isValid)

        val credsInUrl = ApiUrlValidator.validate("https://user:pass@api.vnexsolar.com/", allowDebugCleartext = false)
        assertFalse(credsInUrl.isValid)
    }

    @Test
    fun currencyCatalogIncludesPkrAndInternationalCurrencies() {
        val codes = DomainConstants.SUPPORTED_CURRENCIES.map { it.code }.toSet()
        assertTrue(codes.containsAll(setOf("PKR", "USD", "EUR", "GBP", "AED", "SAR")))
        assertEquals("Rs 12,500.50", DomainConstants.formatMinorCurrency(1_250_050L, "PKR"))
    }

    @Test
    fun customerRoleCannotApproveEngineeringOrPostFinance() {
        assertFalse(RbacPermissions.hasPermission(UserRole.CUSTOMER, PermissionKey.ENGINEERING_APPROVE))
        assertFalse(RbacPermissions.hasPermission(UserRole.CUSTOMER, PermissionKey.FINANCE_POST))
        assertFalse(RbacPermissions.hasPermission(UserRole.CUSTOMER, PermissionKey.INVENTORY_TRANSACT))
        assertTrue(RbacPermissions.hasPermission(UserRole.ORG_OWNER, PermissionKey.COMMISSIONING_APPROVE))
    }
}
