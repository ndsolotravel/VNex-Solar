package com.vnexsolar.app.core.security

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import java.nio.ByteBuffer
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

@Serializable
data class VaultSession(
    val accessToken: String,
    val refreshToken: String,
    val sessionId: String,
    val organizationId: String,
    val organizationName: String,
    val userId: String,
    val userEmail: String,
    val userFullName: String,
    val role: String,
    val defaultCurrency: String = "PKR",
)

@Singleton
class SessionVault @Inject constructor(
    @ApplicationContext private val context: Context,
    private val keystoreManager: KeystoreManager,
    private val json: Json,
) {
    private val vaultFile: File = File(context.filesDir, "vnex_session_vault.enc")
    private val lock = Any()

    private val _sessionFlow = MutableStateFlow<VaultSession?>(readFromDiskSafe())
    val sessionFlow: StateFlow<VaultSession?> = _sessionFlow.asStateFlow()

    val currentSession: VaultSession?
        get() = _sessionFlow.value

    fun saveSession(session: VaultSession) {
        synchronized(lock) {
            val serialized = json.encodeToString(session).toByteArray(Charsets.UTF_8)
            val (iv, ciphertext) = keystoreManager.encrypt(serialized)
            val buffer = ByteBuffer.allocate(4 + iv.size + ciphertext.size)
            buffer.putInt(iv.size)
            buffer.put(iv)
            buffer.put(ciphertext)
            vaultFile.writeBytes(buffer.array())
            _sessionFlow.value = session
        }
    }

    fun updateTokens(accessToken: String, refreshToken: String, sessionId: String) {
        synchronized(lock) {
            val current = _sessionFlow.value ?: return
            saveSession(
                current.copy(
                    accessToken = accessToken,
                    refreshToken = refreshToken,
                    sessionId = sessionId,
                ),
            )
        }
    }

    fun clearSession() {
        synchronized(lock) {
            if (vaultFile.exists()) {
                vaultFile.delete()
            }
            _sessionFlow.value = null
        }
    }

    private fun readFromDiskSafe(): VaultSession? {
        synchronized(lock) {
            if (!vaultFile.exists()) return null
            return try {
                val bytes = vaultFile.readBytes()
                if (bytes.size < 8) return null
                val buffer = ByteBuffer.wrap(bytes)
                val ivLen = buffer.int
                if (ivLen <= 0 || ivLen > 64 || bytes.size <= 4 + ivLen) return null
                val iv = ByteArray(ivLen)
                buffer.get(iv)
                val ciphertext = ByteArray(buffer.remaining())
                buffer.get(ciphertext)
                val plaintext = keystoreManager.decrypt(iv, ciphertext).toString(Charsets.UTF_8)
                json.decodeFromString<VaultSession>(plaintext)
            } catch (_ex: Exception) {
                vaultFile.delete()
                null
            }
        }
    }
}
