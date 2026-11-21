package com.vnexsolar.app.core.network

import com.vnexsolar.app.BuildConfig
import com.vnexsolar.app.core.preferences.AppPreferences
import com.vnexsolar.app.core.security.SessionVault
import java.io.IOException
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.runBlocking
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.Response

@Singleton
class AuthInterceptor @Inject constructor(
    private val sessionVault: SessionVault,
    private val appPreferences: AppPreferences,
) : Interceptor {

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val configuredRaw = runBlocking { appPreferences.getApiBaseUrl() }
        val validation = ApiUrlValidator.validate(configuredRaw, allowDebugCleartext = BuildConfig.DEBUG)
        val configuredBase = if (validation.isValid) {
            validation.normalizedUrl?.toHttpUrlOrNull()
        } else {
            null
        }

        val targetUrl = if (configuredBase != null) {
            original.url.newBuilder()
                .scheme(configuredBase.scheme)
                .host(configuredBase.host)
                .port(configuredBase.port)
                .build()
        } else {
            original.url
        }

        if (!BuildConfig.DEBUG && targetUrl.scheme != "https") {
            throw IOException("Blocked insecure cleartext API request in release build.")
        }

        val requestBuilder = original.newBuilder()
            .url(targetUrl)
            .header("X-Request-Id", UUID.randomUUID().toString())
            .header("Accept", "application/json")

        val isPublicAuthRoute = original.url.encodedPath.endsWith("/auth/login") ||
            original.url.encodedPath.endsWith("/auth/register-organization") ||
            original.url.encodedPath.endsWith("/auth/refresh")

        if (!isPublicAuthRoute && original.header("Authorization") == null) {
            val token = sessionVault.currentSession?.accessToken
            if (!token.isNullOrBlank()) {
                requestBuilder.header("Authorization", "Bearer $token")
            }
        }

        return chain.proceed(requestBuilder.build())
    }
}
