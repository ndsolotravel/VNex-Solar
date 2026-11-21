package com.vnexsolar.app.feature.surveys

import androidx.compose.runtime.Composable
import com.vnexsolar.app.core.media.NativeCameraCaptureScreen

@Composable
fun SurveyCameraScreen(
    surveyId: String,
    onPhotoCaptured: (localFilePath: String, jpegBytes: ByteArray) -> Unit,
    onClose: () -> Unit,
) {
    NativeCameraCaptureScreen(
        title = "Field Evidence CameraX",
        entityType = "field_capture",
        entityId = surveyId,
        onPhotoCaptured = onPhotoCaptured,
        onClose = onClose,
    )
}
