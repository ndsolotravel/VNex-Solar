package com.vnexsolar.app.core.designsystem

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

enum class VNexWindowWidthClass {
    COMPACT,
    MEDIUM,
    EXPANDED,
    ;

    companion object {
        fun fromWidth(width: Dp): VNexWindowWidthClass = when {
            width < 600.dp -> COMPACT
            width < 840.dp -> MEDIUM
            else -> EXPANDED
        }
    }
}

@Composable
fun VNexReadableContentBox(
    modifier: Modifier = Modifier,
    maxContentWidth: Dp = 1080.dp,
    content: @Composable (VNexWindowWidthClass) -> Unit,
) {
    BoxWithConstraints(
        modifier = modifier.fillMaxWidth(),
        contentAlignment = Alignment.TopCenter,
    ) {
        val widthClass = VNexWindowWidthClass.fromWidth(maxWidth)
        Box(modifier = Modifier.widthIn(max = maxContentWidth).fillMaxWidth()) {
            content(widthClass)
        }
    }
}

@Composable
fun VNexPaginationFooter(
    loadedCount: Int,
    totalCount: Int,
    pageSize: Int = 25,
    onLoadMore: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (loadedCount >= totalCount) return
    val remaining = (totalCount - loadedCount).coerceAtMost(pageSize)
    Row(
        modifier = modifier
            .fillMaxWidth()
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = "Showing $loadedCount of $totalCount",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        OutlinedButton(onClick = onLoadMore) {
            Text("Load $remaining More")
        }
    }
}
