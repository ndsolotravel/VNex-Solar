package com.vnexsolar.app.feature.quotations

import com.vnexsolar.app.core.network.QuotationLineItemDto
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

data class QuotationComputedTotals(
    val items: List<QuotationLineItemDto>,
    val equipmentSubtotalMinor: Long,
    val laborCostMinor: Long,
    val transportCostMinor: Long,
    val grossSubtotalMinor: Long,
    val discountMinor: Long,
    val subtotalMinor: Long,
    val taxAmountMinor: Long,
    val totalAmountMinor: Long,
    val totalCostMinor: Long,
    val grossProfitMinor: Long,
    val grossMarginBps: Int,
)

/**
 * Minor-unit integer financial calculator matching `calculateQuotationTotals` in
 * `packages/domain/src/quotations-billing.ts` bit-for-bit across Web and Android.
 */
object QuotationCalculator {
    private fun jsRound(value: Double): Long = floor(value + 0.5).toLong()

    fun calculateTotals(
        rawItems: List<QuotationLineItemDto>,
        discountMinorInput: Long = 0L,
    ): QuotationComputedTotals {
        var equipmentSubtotalMinor = 0L
        var laborCostMinor = 0L
        var transportCostMinor = 0L
        var grossSubtotalMinor = 0L
        var totalCostMinor = 0L

        val computedItems = rawItems.mapIndexed { idx, raw ->
            val qty = max(0.0001, raw.quantity)
            val unitCostMinor = max(0L, raw.unitCostMinor)
            val unitPriceMinor = max(0L, raw.unitPriceMinor)
            val taxRateBps = max(0, raw.taxRateBps)

            val lineCostMinor = jsRound(qty * unitCostMinor.toDouble())
            val lineSubtotalMinor = jsRound(qty * unitPriceMinor.toDouble())
            val lineTaxMinor = jsRound((lineSubtotalMinor.toDouble() * taxRateBps.toDouble()) / 10_000.0)
            val lineTotalMinor = lineSubtotalMinor + lineTaxMinor

            totalCostMinor += lineCostMinor
            grossSubtotalMinor += lineSubtotalMinor

            when (raw.lineType) {
                "equipment", "material" -> equipmentSubtotalMinor += lineSubtotalMinor
                "labor", "service" -> laborCostMinor += lineSubtotalMinor
                "transport" -> transportCostMinor += lineSubtotalMinor
            }

            raw.copy(
                id = raw.id ?: "qt-line-${idx + 1}",
                description = raw.description.trim(),
                quantity = qty,
                unitCostMinor = unitCostMinor,
                unitPriceMinor = unitPriceMinor,
                taxRateBps = taxRateBps,
                lineCostMinor = lineCostMinor,
                lineSubtotalMinor = lineSubtotalMinor,
                lineTaxMinor = lineTaxMinor,
                lineTotalMinor = lineTotalMinor,
            )
        }

        val discountMinor = max(0L, min(grossSubtotalMinor, discountMinorInput))
        val netSubtotalMinor = grossSubtotalMinor - discountMinor

        var taxAmountMinor = 0L
        if (grossSubtotalMinor > 0L && discountMinor > 0L) {
            for (item in computedItems) {
                val discountedLineSub = jsRound(
                    (item.lineSubtotalMinor.toDouble() * netSubtotalMinor.toDouble()) / grossSubtotalMinor.toDouble(),
                )
                taxAmountMinor += jsRound(
                    (discountedLineSub.toDouble() * item.taxRateBps.toDouble()) / 10_000.0,
                )
            }
        } else {
            taxAmountMinor = computedItems.sumOf { it.lineTaxMinor }
        }

        val totalAmountMinor = netSubtotalMinor + taxAmountMinor
        val grossProfitMinor = netSubtotalMinor - totalCostMinor
        val grossMarginBps = if (netSubtotalMinor > 0L) {
            jsRound((grossProfitMinor.toDouble() * 10_000.0) / netSubtotalMinor.toDouble()).toInt()
        } else {
            0
        }

        return QuotationComputedTotals(
            items = computedItems,
            equipmentSubtotalMinor = equipmentSubtotalMinor,
            laborCostMinor = laborCostMinor,
            transportCostMinor = transportCostMinor,
            grossSubtotalMinor = grossSubtotalMinor,
            discountMinor = discountMinor,
            subtotalMinor = netSubtotalMinor,
            taxAmountMinor = taxAmountMinor,
            totalAmountMinor = totalAmountMinor,
            totalCostMinor = totalCostMinor,
            grossProfitMinor = grossProfitMinor,
            grossMarginBps = grossMarginBps,
        )
    }
}
