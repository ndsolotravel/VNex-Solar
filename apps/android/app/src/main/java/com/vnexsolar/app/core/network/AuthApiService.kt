package com.vnexsolar.app.core.network

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

@Serializable
data class LoginRequestDto(
    val email: String,
    val password: String,
    val organizationSlug: String? = null,
    val deviceId: String? = null,
)

@Serializable
data class RegisterOrgRequestDto(
    val legalName: String,
    val displayName: String,
    val slug: String,
    val businessAddress: String,
    val countryCode: String = "PK",
    val defaultCurrency: String = "PKR",
    val ownerFullName: String,
    val ownerEmail: String,
    val password: String,
    val deviceId: String? = null,
)

@Serializable
data class RefreshTokenRequestDto(
    val refreshToken: String,
)

@Serializable
data class OrganizationDto(
    val id: String,
    val slug: String,
    val legalName: String,
    val displayName: String,
    val businessAddress: String,
    val countryCode: String,
    val defaultCurrency: String,
    val taxRegistrationNumber: String? = null,
    val status: String,
    val createdAt: String,
)

@Serializable
data class AuthUserDto(
    val id: String,
    val email: String,
    val fullName: String,
)

@Serializable
data class AuthSessionResponseDto(
    val organization: OrganizationDto,
    val user: AuthUserDto,
    val role: String,
    val accessToken: String,
    val refreshToken: String,
    val sessionId: String,
)

@Serializable
data class RefreshSessionResponseDto(
    val accessToken: String,
    val refreshToken: String,
    val sessionId: String,
)

@Serializable
data class AuthMeResponseDto(
    val userId: String,
    val organizationId: String,
    val organizationName: String,
    val role: String,
    val sessionId: String,
)

@Serializable
data class LogoutResponseDto(
    val revoked: Boolean = true,
)

@Serializable
data class OrganizationMemberDto(
    val membershipId: String,
    val userId: String,
    val email: String,
    val fullName: String,
    val role: String,
    val roleLabel: String,
    val status: String,
    val createdAt: String,
)

@Serializable
data class OrganizationMembersResponseDto(
    val members: List<OrganizationMemberDto>,
)

interface AuthApiService {
    @POST("api/v1/auth/login")
    suspend fun login(@Body request: LoginRequestDto): AuthSessionResponseDto

    @POST("api/v1/auth/register-organization")
    suspend fun registerOrganization(@Body request: RegisterOrgRequestDto): AuthSessionResponseDto

    @POST("api/v1/auth/refresh")
    suspend fun refresh(@Body request: RefreshTokenRequestDto): RefreshSessionResponseDto

    @POST("api/v1/auth/logout")
    suspend fun logout(): LogoutResponseDto

    @GET("api/v1/auth/me")
    suspend fun me(): AuthMeResponseDto

    @GET("api/v1/organizations/current")
    suspend fun currentOrganization(): OrganizationDto

    @GET("api/v1/organizations/members")
    suspend fun listMembers(): OrganizationMembersResponseDto
}
