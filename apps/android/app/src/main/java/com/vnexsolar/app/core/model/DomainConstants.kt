package com.vnexsolar.app.core.model

import java.text.NumberFormat
import java.util.Locale

data class SupportedCurrencyMeta(
    val code: String,
    val symbol: String,
    val label: String,
    val minorUnits: Int = 2,
)

enum class PaymentMethodOption(val apiValue: String, val label: String) {
    CASH("cash", "Cash"),
    BANK_TRANSFER("bank_transfer", "Bank Transfer"),
    JAZZCASH("jazzcash", "JazzCash"),
    EASYPAISA("easypaisa", "Easypaisa"),
    CHEQUE("cheque", "Cheque"),
    CARD("card", "Card"),
    ONLINE("online", "Online Transfer");

    companion object {
        fun fromApi(raw: String): PaymentMethodOption =
            entries.firstOrNull { it.apiValue == raw } ?: BANK_TRANSFER
    }
}

object DomainConstants {
    val SUPPORTED_CURRENCIES: List<SupportedCurrencyMeta> = listOf(
        SupportedCurrencyMeta("PKR", "Rs", "Pakistani Rupee (PKR)", 2),
        SupportedCurrencyMeta("USD", "$", "US Dollar (USD)", 2),
        SupportedCurrencyMeta("AED", "AED", "UAE Dirham (AED)", 2),
        SupportedCurrencyMeta("SAR", "SAR", "Saudi Riyal (SAR)", 2),
        SupportedCurrencyMeta("EUR", "€", "Euro (EUR)", 2),
        SupportedCurrencyMeta("GBP", "£", "British Pound (GBP)", 2),
    )

    fun formatMinorCurrency(amountMinor: Long, currencyCode: String = "PKR"): String {
        val meta = SUPPORTED_CURRENCIES.firstOrNull { it.code == currencyCode } ?: SUPPORTED_CURRENCIES.first()
        val major = amountMinor.toDouble() / 100.0
        val formatter = NumberFormat.getNumberInstance(Locale.US).apply {
            minimumFractionDigits = if (amountMinor % 100L == 0L) 0 else 2
            maximumFractionDigits = 2
        }
        return "${meta.symbol} ${formatter.format(major)}"
    }
}
