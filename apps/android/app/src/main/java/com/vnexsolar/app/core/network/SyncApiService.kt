package com.vnexsolar.app.core.network

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
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
    val decision: String,
    val mergedPayload: JsonObject? = null,
)

interface SyncApiService {
    @POST("api/v1/sync/batch")
    suspend fun pushBatch(@Body request: SyncBatchRequestDto): SyncBatchResponseDto

    @GET("api/v1/sync/delta")
    suspend fun pullDelta(
        @Query("sinceSeq") sinceSeq: Long,
        @Query("limit") limit: Int = 50,
    ): SyncDeltaResponseDto

    @POST("api/v1/sync/conflicts/{id}/resolve")
    suspend fun resolveConflict(
        @Path("id") conflictId: String,
        @Body request: ResolveConflictRequestDto,
    )
}
