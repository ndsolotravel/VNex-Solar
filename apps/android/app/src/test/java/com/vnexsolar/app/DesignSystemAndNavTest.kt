package com.vnexsolar.app

import com.vnexsolar.app.core.navigation.PRIMARY_DESTINATIONS
import com.vnexsolar.app.core.navigation.VNexRoute
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DesignSystemAndNavTest {

    @Test
    fun primaryNavigationContainsAllCoreFieldRoutes() {
        val routes = PRIMARY_DESTINATIONS.map { it.route }
        assertEquals(6, routes.size)
        assertTrue(routes.contains(VNexRoute.Home.route))
        assertTrue(routes.contains(VNexRoute.Surveys.route))
        assertTrue(routes.contains(VNexRoute.Engineering.route))
        assertTrue(routes.contains(VNexRoute.FieldWork.route))
        assertTrue(routes.contains(VNexRoute.Safety.route))
        assertTrue(routes.contains(VNexRoute.SyncQueue.route))
    }
}
