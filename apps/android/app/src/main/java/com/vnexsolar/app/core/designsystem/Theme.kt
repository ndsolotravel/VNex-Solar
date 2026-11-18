package com.vnexsolar.app.core.designsystem

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

object VNexColors {
    val AmberPrimaryLight = Color(0xFFD97706)
    val AmberPrimaryDark = Color(0xFFF59E0B)
    val SlateCanvasLight = Color(0xFFF8FAFC)
    val SlateSurfaceLight = Color(0xFFFFFFFF)
    val SlateElevatedLight = Color(0xFFF1F5F9)
    val SlateBorderLight = Color(0xFFE2E8F0)
    val SlateTextPrimaryLight = Color(0xFF0F172A)
    val SlateTextSecondaryLight = Color(0xFF334155)

    val SlateCanvasDark = Color(0xFF0B1120)
    val SlateSurfaceDark = Color(0xFF111827)
    val SlateElevatedDark = Color(0xFF1E293B)
    val SlateBorderDark = Color(0xFF1F2937)
    val SlateTextPrimaryDark = Color(0xFFF8FAFC)
    val SlateTextSecondaryDark = Color(0xFFCBD5E1)

    val NominalGreen = Color(0xFF16A34A)
    val WarningAmber = Color(0xFFD97706)
    val CriticalRed = Color(0xFFDC2626)
}

private val LightColorScheme = lightColorScheme(
    primary = VNexColors.AmberPrimaryLight,
    onPrimary = Color.White,
    secondary = VNexColors.SlateTextSecondaryLight,
    onSecondary = Color.White,
    background = VNexColors.SlateCanvasLight,
    onBackground = VNexColors.SlateTextPrimaryLight,
    surface = VNexColors.SlateSurfaceLight,
    onSurface = VNexColors.SlateTextPrimaryLight,
    surfaceVariant = VNexColors.SlateElevatedLight,
    onSurfaceVariant = VNexColors.SlateTextSecondaryLight,
    outline = VNexColors.SlateBorderLight,
    error = VNexColors.CriticalRed,
    onError = Color.White,
)

private val DarkColorScheme = darkColorScheme(
    primary = VNexColors.AmberPrimaryDark,
    onPrimary = VNexColors.SlateCanvasDark,
    secondary = VNexColors.SlateTextSecondaryDark,
    onSecondary = VNexColors.SlateCanvasDark,
    background = VNexColors.SlateCanvasDark,
    onBackground = VNexColors.SlateTextPrimaryDark,
    surface = VNexColors.SlateSurfaceDark,
    onSurface = VNexColors.SlateTextPrimaryDark,
    surfaceVariant = VNexColors.SlateElevatedDark,
    onSurfaceVariant = VNexColors.SlateTextSecondaryDark,
    outline = VNexColors.SlateBorderDark,
    error = VNexColors.CriticalRed,
    onError = Color.White,
)

val VNexTypography = Typography(
    headlineMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 24.sp,
        lineHeight = 32.sp,
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.SemiBold,
        fontSize = 16.sp,
        lineHeight = 22.sp,
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.SansSerif,
        fontWeight = FontWeight.Normal,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    ),
    labelMedium = TextStyle(
        fontFamily = FontFamily.Monospace,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        fontFeatureSettings = "tnum",
    ),
)

@Composable
fun VNexTheme(
    darkTheme: Boolean = false,
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    MaterialTheme(
        colorScheme = colorScheme,
        typography = VNexTypography,
        content = content,
    )
}
