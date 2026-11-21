package com.vnexsolar.app

import com.vnexsolar.app.core.sync.ChecksumUtil
import org.junit.Assert.assertEquals
import org.junit.Test

class SyncBackoffAndChecksumTest {

    @Test
    fun `computeRetryBackoffMs scales exponentially and caps at one hour`() {
        assertEquals(15_000L, ChecksumUtil.computeRetryBackoffMs(0))
        assertEquals(30_000L, ChecksumUtil.computeRetryBackoffMs(1))
        assertEquals(60_000L, ChecksumUtil.computeRetryBackoffMs(2))
        assertEquals(120_000L, ChecksumUtil.computeRetryBackoffMs(3))
        assertEquals(3_600_000L, ChecksumUtil.computeRetryBackoffMs(9))
        assertEquals(3_600_000L, ChecksumUtil.computeRetryBackoffMs(25))
    }

    @Test
    fun `sha256Hex produces deterministic 64-char hex digest`() {
        val digest = ChecksumUtil.sha256Hex("vnex-solar-sync".toByteArray(Charsets.UTF_8))
        assertEquals(64, digest.length)
        assertEquals(digest, ChecksumUtil.sha256Hex("vnex-solar-sync".toByteArray(Charsets.UTF_8)))
    }
}
