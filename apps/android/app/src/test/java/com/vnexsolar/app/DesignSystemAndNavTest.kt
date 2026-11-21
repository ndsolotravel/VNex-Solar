package com.vnexsolar.app

import com.vnexsolar.app.core.navigation.PRIMARY_DESTINATIONS
import com.vnexsolar.app.core.navigation.VNexRoute
import com.vnexsolar.app.core.navigation.VNexRoutes
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DesignSystemAndNavTest {

    @Test
    fun primaryNavigationContainsExactFiveDestinations() {
        val routes = PRIMARY_DESTINATIONS.map { it.route }
        assertEquals(5, routes.size)
        assertEquals(
            listOf(
                VNexRoute.Dashboard.route,
                VNexRoute.Projects.route,
                VNexRoute.Customers.route,
                VNexRoute.Finance.route,
                VNexRoute.More.route,
            ),
            routes,
        )
    }

    @Test
    fun primaryDestinationsPreserveExpectedLabels() {
        val labels = PRIMARY_DESTINATIONS.map { it.label }
        assertEquals(listOf("Dashboard", "Projects", "Customers", "Finance", "More"), labels)
    }

    @Test
    fun moreHubRoutesRemainDistinctFromPrimaryBar() {
        val primarySet = PRIMARY_DESTINATIONS.map { it.route }.toSet()
        assertTrue(VNexRoutes.ENGINEERING !in primarySet)
        assertTrue(VNexRoutes.QUOTATIONS !in primarySet)
        assertTrue(VNexRoutes.INVENTORY !in primarySet)
        assertTrue(VNexRoutes.SYNC_QUEUE !in primarySet)
        assertTrue(VNexRoutes.SETTINGS !in primarySet)
    }
}
