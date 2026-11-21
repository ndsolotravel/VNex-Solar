package com.vnexsolar.app.core.network

import java.net.URI
import java.util.Locale

data class ApiUrlValidationResult(
    val isValid: Boolean,
    val normalizedUrl: String? = null,
    val errorMessage: String? = null,
)

object ApiUrlValidator {

    private val debugLoopbackHosts = setOf("10.0.2.2", "localhost", "127.0.0.1")

    fun validate(rawUrl: String, allowDebugCleartext: Boolean): ApiUrlValidationResult {
        val trimmed = rawUrl.trim()
        if (trimmed.isEmpty()) {
            return ApiUrlValidationResult(false, errorMessage = "Server URL cannot be empty.")
        }

        val uri = runCatching { URI(trimmed) }.getOrNull()
            ?: return ApiUrlValidationResult(false, errorMessage = "Invalid URL format.")

        val scheme = uri.scheme?.lowercase(Locale.US)
        val host = uri.host?.lowercase(Locale.US)
        if (scheme.isNullOrBlank() || host.isNullOrBlank()) {
            return ApiUrlValidationResult(false, errorMessage = "Include https:// and a valid host name.")
        }

        if (scheme != "https" && scheme != "http") {
            return ApiUrlValidationResult(false, errorMessage = "Only HTTPS URLs are permitted.")
        }

        if (scheme == "http") {
            val isLocalDevHost = allowDebugCleartext && debugLoopbackHosts.contains(host)
            if (!isLocalDevHost) {
                return ApiUrlValidationResult(
                    isValid = false,
                    errorMessage = "Cleartext HTTP is blocked. Use HTTPS for production servers.",
                )
            }
        }

        if (!uri.userInfo.isNullOrBlank()) {
            return ApiUrlValidationResult(false, errorMessage = "Embedded URL credentials are not allowed.")
        }

        val normalized = if (trimmed.endsWith("/")) trimmed else "$trimmed/"
        return ApiUrlValidationResult(isValid = true, normalizedUrl = normalized)
    }
}
