package com.vnexsolar.app.core.network

import com.vnexsolar.app.core.preferences.AppPreferences
import com.vnexsolar.app.core.security.SessionVault
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route

@Singleton
class TokenRefreshAuthenticator @Inject constructor(
    private val sessionVault: SessionVault,
    private val appPreferences: AppPreferences,
    @Named("refreshAuthApi") private val refreshAuthApi: AuthApiService,
) : Authenticator {

    private val refreshLock = Any()

    override fun authenticate(route: Route?, response: Response): Request? {
        val path = response.request.url.encodedPath
        if (path.endsWith("/auth/login") || path.endsWith("/auth/refresh")) {
            return null
        }

        if (responseCount(response) >= 2) {
            return null
        }

        synchronized(refreshLock) {
            val activeSession = sessionVault.currentSession ?: return null
            val requestAuth = response.request.header("Authorization")?.removePrefix("Bearer ")?.trim()

            // Another thread already refreshed the access token; retry with latest token
            if (!requestAuth.isNullOrBlank() && requestAuth != activeSession.accessToken) {
                return response.request.newBuilder()
                    .header("Authorization", "Bearer ${activeSession.accessToken}")
                    .build()
            }

            return try {
                val refreshed = runBlocking {
                    refreshAuthApi.refresh(RefreshTokenRequestDto(refreshToken = activeSession.refreshToken))
                }
                sessionVault.updateTokens(
                    accessToken = refreshed.accessToken,
                    refreshToken = refreshed.refreshToken,
                    sessionId = refreshed.sessionId,
                )
                response.request.newBuilder()
                    .header("Authorization", "Bearer ${refreshed.accessToken}")
                    .build()
            } catch (_ex: Exception) {
                sessionVault.clearSession()
                runBlocking { appPreferences.clearSessionMetadata() }
                null
            }
        }
    }

    private fun responseCount(response: Response): Int {
        var count = 1
        var prior = response.priorResponse
        while (prior != null) {
            count++
            prior = prior.priorResponse
        }
        return count
    }
}
