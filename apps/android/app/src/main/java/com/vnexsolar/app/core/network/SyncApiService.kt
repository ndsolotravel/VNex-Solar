package com.vnexsolar.app.core.network

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

@Serializable
data class SyncBatchOperationDto(
    val syncOperationId: String,
    val idempotencyKey: String,
    val entityType: String,
    val entityId: String,
    val operationType: String,
    val baseRowVersion: Int,
    val payloadSha256: String,
    val payload: JsonObject,
    val clientTimestamp: String,
)

@Serializable
data class SyncBatchRequestDto(
    val deviceId: String,
    val operations: List<SyncBatchOperationDto>,
)

@Serializable
data class SyncBatchOperationResultDto(
    val syncOperationId: String,
    val idempotencyKey: String,
    val entityType: String,
    val entityId: String,
    val status: String,
    val deduplicated: Boolean,
    val serverSeq: Long? = null,
    val newRowVersion: Int? = null,
    val conflictId: String? = null,
    val serverSnapshot: JsonObject? = null,
    val reason: String? = null,
)

@Serializable
data class SyncBatchResponseDto(
    val results: List<SyncBatchOperationResultDto>,
    val checkpointSeq: Long,
)

@Serializable
data class SyncDeltaEntityChangeDto(
    val serverSeq: Long,
    val entityType: String,
    val entityId: String,
    val operationType: String,
    val rowVersion: Int,
    val data: JsonObject,
    val updatedAt: String,
)

@Serializable
data class SyncDeltaResponseDto(
    val sinceSeq: Long,
    val nextServerSeq: Long,
    val hasMore: Boolean,
    val changes: List<SyncDeltaEntityChangeDto>,
)

@Serializable
data class ResolveConflictRequestDto(
    val decision: String, // accept_server | merge_client
    val mergedPayload: JsonObject? = null,
)

@Serializable
data class ServerSyncConflictDto(
    val id: String,
    val organizationId: String = "",
    val syncOperationId: String = "",
    val entityType: String,
    val entityId: String,
    val clientPayload: JsonObject? = null,
    val serverSnapshot: JsonObject? = null,
    val resolutionStatus: String = "pending",
    val createdAt: String = "",
)

@Serializable
data class SyncConflictsListResponseDto(
    val conflicts: List<ServerSyncConflictDto> = emptyList(),
)

@Serializable
data class UpdateCheckpointRequestDto(
    val lastServerSeq: Long,
)

@Serializable
data class SyncCheckpointResponseDto(
    val deviceId: String = "",
    val lastServerSeq: Long = 0L,
    val updatedAt: String = "",
)

@Serializable
data class SyncHealthMetricsDto(
    val appliedOpsCount: Int = 0,
    val deduplicatedOpsCount: Int = 0,
    val rejectedOpsCount: Int = 0,
    val pendingConflictsCount: Int = 0,
    val resolvedConflictsCount: Int = 0,
    val pendingDeadLettersCount: Int = 0,
    val activeDevicesCount: Int = 0,
    val latestServerSeq: Long = 0L,
)

@Serializable
data class SyncDeadLetterDto(
    val id: String,
    val deviceId: String = "",
    val syncOperationId: String = "",
    val idempotencyKey: String = "",
    val entityType: String = "",
    val entityId: String = "",
    val operationType: String = "",
    val reason: String = "",
    val acknowledged: Boolean = false,
    val createdAt: String = "",
)

@Serializable
data class SyncDeadLettersResponseDto(
    val deadLetters: List<SyncDeadLetterDto> = emptyList(),
)

@Serializable
data class PresignSyncMediaRequestDto(
    val deviceId: String,
    val entityType: String,
    val entityId: String,
    val filename: String,
    val mimeType: String,
    val byteSize: Long,
    val expectedSha256: String,
)

@Serializable
data class PresignSyncMediaResponseDto(
    val id: String,
    val uploadUrl: String = "",
    val status: String = "presigned",
)

@Serializable
data class VerifySyncMediaRequestDto(
    val actualSha256: String,
)

@Serializable
data class VerifySyncMediaResponseDto(
    val id: String,
    val status: String = "uploaded",
)

interface SyncApiService {
    @POST("api/v1/sync/batch")
    suspend fun pushBatch(@Body request: SyncBatchRequestDto): SyncBatchResponseDto

    @GET("api/v1/sync/delta")
    suspend fun pullDelta(
        @Query("sinceSeq") sinceSeq: Long,
        @Query("limit") limit: Int = 50,
    ): SyncDeltaResponseDto

    @GET("api/v1/sync/conflicts")
    suspend fun listConflicts(): SyncConflictsListResponseDto

    @POST("api/v1/sync/conflicts/{id}/resolve")
    suspend fun resolveConflict(
        @Path("id") conflictId: String,
        @Body request: ResolveConflictRequestDto,
    ): ServerSyncConflictDto

    @PUT("api/v1/sync/checkpoints/{deviceId}")
    suspend fun updateCheckpoint(
        @Path("deviceId") deviceId: String,
        @Body request: UpdateCheckpointRequestDto,
    ): SyncCheckpointResponseDto

    @GET("api/v1/sync/metrics")
    suspend fun getMetrics(): SyncHealthMetricsDto

    @GET("api/v1/sync/dead-letters")
    suspend fun listDeadLetters(
        @Query("includeAcknowledged") includeAcknowledged: Boolean = false,
    ): SyncDeadLettersResponseDto

    @POST("api/v1/sync/dead-letters/{id}/acknowledge")
    suspend fun acknowledgeDeadLetter(@Path("id") deadLetterId: String): SyncDeadLetterDto

    @POST("api/v1/sync/media/presign")
    suspend fun presignMediaUpload(@Body request: PresignSyncMediaRequestDto): PresignSyncMediaResponseDto

    @POST("api/v1/sync/media/{id}/verify")
    suspend fun verifyMediaUpload(
        @Path("id") mediaId: String,
        @Body request: VerifySyncMediaRequestDto,
    ): VerifySyncMediaResponseDto
}
