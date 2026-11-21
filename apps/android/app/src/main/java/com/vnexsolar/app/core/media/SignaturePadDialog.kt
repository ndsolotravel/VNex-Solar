package com.vnexsolar.app.core.media

import android.graphics.Bitmap
import android.graphics.Color as AndroidColor
import android.graphics.Paint
import android.graphics.Path as AndroidPath
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import com.vnexsolar.app.core.sync.ChecksumUtil
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.UUID

@Composable
fun CustomerSignatureDialog(
    certificateCode: String,
    initialSignoffName: String = "",
    onSignatureConfirmed: (
        signoffName: String,
        signaturePngBytes: ByteArray,
        localFilePath: String,
        sha256Hex: String,
    ) -> Unit,
    onDismiss: () -> Unit,
) {
    val context = LocalContext.current
    var signoffName by remember { mutableStateOf(initialSignoffName) }
    val strokes = remember { mutableStateListOf<List<Offset>>() }
    var activeStroke by remember { mutableStateOf<List<Offset>>(emptyList()) }
    var canvasSize by remember { mutableStateOf(IntSize(800, 360)) }
    var validationError by remember { mutableStateOf<String?>(null) }
    var renderTick by remember { mutableIntStateOf(0) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Customer Handover Sign-Off ($certificateCode)") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = signoffName,
                    onValueChange = {
                        signoffName = it
                        validationError = null
                    },
                    label = { Text("Customer / Authorized Signatory Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )

                Text(
                    text = "Sign inside the box below using finger or stylus:",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(170.dp)
                        .background(Color.White, RoundedCornerShape(8.dp))
                        .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(8.dp))
                        .onSizeChanged { canvasSize = it },
                ) {
                    Canvas(
                        modifier = Modifier
                            .fillMaxSize()
                            .pointerInput(renderTick) {
                                detectDragGestures(
                                    onDragStart = { startOffset ->
                                        activeStroke = listOf(startOffset)
                                        validationError = null
                                    },
                                    onDrag = { change, _ ->
                                        change.consume()
                                        activeStroke = activeStroke + change.position
                                    },
                                    onDragEnd = {
                                        if (activeStroke.size >= 2) {
                                            strokes.add(activeStroke)
                                        }
                                        activeStroke = emptyList()
                                    },
                                    onDragCancel = {
                                        activeStroke = emptyList()
                                    },
                                )
                            },
                    ) {
                        val strokeStyle = Stroke(
                            width = 5f,
                            cap = StrokeCap.Round,
                            join = StrokeJoin.Round,
                        )
                        (strokes + listOf(activeStroke)).forEach { pts ->
                            if (pts.size >= 2) {
                                val path = Path().apply {
                                    moveTo(pts.first().x, pts.first().y)
                                    for (i in 1 until pts.size) {
                                        lineTo(pts[i].x, pts[i].y)
                                    }
                                }
                                drawPath(
                                    path = path,
                                    color = Color(0xFF0F172A),
                                    style = strokeStyle,
                                )
                            }
                        }
                    }

                    if (strokes.isEmpty() && activeStroke.isEmpty()) {
                        Text(
                            text = "Draw signature here",
                            modifier = Modifier.align(Alignment.Center),
                            style = MaterialTheme.typography.bodySmall,
                            color = Color(0xFF94A3B8),
                        )
                    }
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "${strokes.size} stroke(s)",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedButton(
                        onClick = {
                            strokes.clear()
                            activeStroke = emptyList()
                            renderTick += 1
                        },
                    ) {
                        Text("Clear Signature")
                    }
                }

                validationError?.let { err ->
                    Text(
                        text = err,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val trimmedName = signoffName.trim()
                    if (trimmedName.length < 2) {
                        validationError = "Enter signatory name (at least 2 characters)."
                        return@Button
                    }
                    if (strokes.isEmpty()) {
                        validationError = "Customer canvas signature is required."
                        return@Button
                    }
                    val pngBytes = renderSignatureToPng(
                        strokes = strokes.toList(),
                        sourceWidth = canvasSize.width.coerceAtLeast(1),
                        sourceHeight = canvasSize.height.coerceAtLeast(1),
                    )
                    val sigDir = File(context.filesDir, "signatures").apply { mkdirs() }
                    val sigFile = File(sigDir, "sig_${certificateCode}_${UUID.randomUUID()}.png")
                    sigFile.writeBytes(pngBytes)
                    val sha256 = ChecksumUtil.sha256Hex(pngBytes)
                    onSignatureConfirmed(trimmedName, pngBytes, sigFile.absolutePath, sha256)
                },
            ) {
                Text("Confirm Sign-Off")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        },
    )
}

private fun renderSignatureToPng(
    strokes: List<List<Offset>>,
    sourceWidth: Int,
    sourceHeight: Int,
): ByteArray {
    val targetWidth = 800
    val targetHeight = 320
    val bitmap = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888)
    val canvas = android.graphics.Canvas(bitmap)
    canvas.drawColor(AndroidColor.WHITE)

    val paint = Paint().apply {
        color = AndroidColor.rgb(15, 23, 42)
        strokeWidth = 6f
        style = Paint.Style.STROKE
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
        isAntiAlias = true
    }

    val scaleX = targetWidth.toFloat() / sourceWidth.toFloat()
    val scaleY = targetHeight.toFloat() / sourceHeight.toFloat()

    strokes.forEach { pts ->
        if (pts.size >= 2) {
            val path = AndroidPath().apply {
                moveTo(pts.first().x * scaleX, pts.first().y * scaleY)
                for (i in 1 until pts.size) {
                    lineTo(pts[i].x * scaleX, pts[i].y * scaleY)
                }
            }
            canvas.drawPath(path, paint)
        }
    }

    return ByteArrayOutputStream().use { out ->
        bitmap.compress(Bitmap.CompressFormat.PNG, 95, out)
        out.toByteArray()
    }
}
