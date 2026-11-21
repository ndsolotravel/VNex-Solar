package com.vnexsolar.app

import com.vnexsolar.app.core.network.QuotationLineItemDto
import com.vnexsolar.app.feature.quotations.QuotationCalculator
import org.junit.Assert.assertEquals
import org.junit.Test

class QuotationCalculatorTest {

    @Test
    fun `matches exact minor-unit totals and proportional tax allocation when discount applied`() {
        val items = listOf(
            QuotationLineItemDto(
                lineType = "equipment",
                description = "585W Bifacial Panels",
                quantity = 20.0,
                unitCostMinor = 2_800_000L, // Rs 28,000
                unitPriceMinor = 3_400_000L, // Rs 34,000 -> lineSub = 68,000,000 (Rs 680,000)
                taxRateBps = 0,
            ),
            QuotationLineItemDto(
                lineType = "labor",
                description = "EPC Installation & Earthing",
                quantity = 1.0,
                unitCostMinor = 8_000_000L, // Rs 80,000
                unitPriceMinor = 12_000_000L, // Rs 120,000 -> lineSub = 12,000,000
                taxRateBps = 1800, // 18%
            ),
            QuotationLineItemDto(
                lineType = "transport",
                description = "Lahore Site Delivery",
                quantity = 1.0,
                unitCostMinor = 1_500_000L,
                unitPriceMinor = 2_000_000L, // Rs 20,000
                taxRateBps = 0,
            ),
        )

        // Gross subtotal = 68,000,000 + 12,000,000 + 2,000,000 = 82,000,000
        // Discount = 4,100,000 (5% of 82,000,000) -> Net subtotal = 77,900,000
        // Proportional discounted labor = Math.round(12,000,000 * 77,900,000 / 82,000,000) = 11,400,000
        // Tax = Math.round(11,400,000 * 1800 / 10000) = 2,052,000
        // Total = 77,900,000 + 2,052,000 = 79,952,000
        // Total cost = 20 * 2,800,000 + 8,000,000 + 1,500,000 = 65,500,000
        // Gross profit = 77,900,000 - 65,500,000 = 12,400,000
        val totals = QuotationCalculator.calculateTotals(items, discountMinorInput = 4_100_000L)

        assertEquals(68_000_000L, totals.equipmentSubtotalMinor)
        assertEquals(12_000_000L, totals.laborCostMinor)
        assertEquals(2_000_000L, totals.transportCostMinor)
        assertEquals(4_100_000L, totals.discountMinor)
        assertEquals(77_900_000L, totals.subtotalMinor)
        assertEquals(2_052_000L, totals.taxAmountMinor)
        assertEquals(79_952_000L, totals.totalAmountMinor)
        assertEquals(65_500_000L, totals.totalCostMinor)
        assertEquals(12_400_000L, totals.grossProfitMinor)
        assertEquals(1592, totals.grossMarginBps) // round(12.4M * 10000 / 77.9M) = 1592 bps
    }

    @Test
    fun `clamps excessive discount to gross subtotal and yields zero negative total`() {
        val items = listOf(
            QuotationLineItemDto(
                lineType = "service",
                description = "Site Inspection",
                quantity = 1.0,
                unitCostMinor = 500_000L,
                unitPriceMinor = 1_000_000L,
                taxRateBps = 1800,
            ),
        )

        val totals = QuotationCalculator.calculateTotals(items, discountMinorInput = 9_999_999L)
        assertEquals(1_000_000L, totals.discountMinor)
        assertEquals(0L, totals.subtotalMinor)
        assertEquals(0L, totals.taxAmountMinor)
        assertEquals(0L, totals.totalAmountMinor)
    }
}
