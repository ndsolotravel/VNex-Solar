package com.vnexsolar.app

import com.vnexsolar.app.core.sync.ChecksumUtil
import org.junit.Assert.assertEquals
import org.junit.Test

class OfflineOutboxRecoveryTest {

    @Test
    fun sha256ChecksumIsDeterministic() {
        val payload = """{"fullName":"Ali Hassan","city":"Lahore"}"""
        val a = ChecksumUtil.sha256Hex(payload.toByteArray(Charsets.UTF_8))
        val b = ChecksumUtil.sha256Hex(payload.toByteArray(Charsets.UTF_8))
        assertEquals(64, a.length)
        assertEquals(a, b)
    }

    @Test
    fun exponentialBackoffClampsAtMaximumDelay() {
        assertEquals(15_000L, ChecksumUtil.computeRetryBackoffMs(0))
        assertEquals(30_000L, ChecksumUtil.computeRetryBackoffMs(1))
        assertEquals(60_000L, ChecksumUtil.computeRetryBackoffMs(2))
        assertEquals(3_600_000L, ChecksumUtil.computeRetryBackoffMs(12))
    }
}
