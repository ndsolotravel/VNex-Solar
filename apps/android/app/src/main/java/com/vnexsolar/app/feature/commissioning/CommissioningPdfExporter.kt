package com.vnexsolar.app.feature.commissioning

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import androidx.core.content.FileProvider
import com.vnexsolar.app.core.network.CommissioningRecordDetailDto
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

object CommissioningPdfExporter {
    private const val PAGE_WIDTH = 595
    private const val PAGE_HEIGHT = 842
    private const val MARGIN = 36f

    fun generatePdf(
        context: Context,
        organizationName: String,
        projectTitle: String,
        record: CommissioningRecordDetailDto,
        signaturePngBytes: ByteArray? = null,
    ): File {
        val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val file = File(exportDir, "${record.certificateCode.replace('/', '-')}_handover.pdf")

        val doc = PdfDocument()
        val pageInfo = PdfDocument.PageInfo.Builder(PAGE_WIDTH, PAGE_HEIGHT, 1).create()
        val page = doc.startPage(pageInfo)
        val canvas = page.canvas

        val brandPaint = Paint().apply {
            color = Color.rgb(15, 118, 110)
            textSize = 18f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val titlePaint = Paint().apply {
            color = Color.rgb(15, 23, 42)
            textSize = 13f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val bodyPaint = Paint().apply {
            color = Color.rgb(30, 41, 59)
            textSize = 10f
        }
        val mutedPaint = Paint().apply {
            color = Color.rgb(100, 116, 139)
            textSize = 9f
        }
        val passPaint = Paint().apply {
            color = Color.rgb(21, 128, 61)
            textSize = 10f
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        val linePaint = Paint().apply {
            color = Color.rgb(203, 213, 225)
            strokeWidth = 1f
        }

        var y = 44f
        canvas.drawText("$organizationName — Solar PV Commissioning Certificate", MARGIN, y, brandPaint)
        y += 18f
        canvas.drawText("Certificate: ${record.certificateCode}   |   Status: ${record.status.uppercase()}", MARGIN, y, titlePaint)
        y += 16f
        canvas.drawText("Project: ${projectTitle.take(64)}   |   Safety Gate: ${if (record.safetyClearedSnapshot) "CLEARED" else "PENDING"}", MARGIN, y, bodyPaint)
        y += 14f
        canvas.drawText("Commissioned At: ${record.commissionedAt ?: "Pending engineer approval"}", MARGIN, y, mutedPaint)
        y += 14f
        canvas.drawLine(MARGIN, y, PAGE_WIDTH - MARGIN, y, linePaint)
        y += 18f

        canvas.drawText("1. Electrical & IEC 62446-1 Commissioning Test Suite", MARGIN, y, titlePaint)
        y += 16f
        if (record.tests.isEmpty()) {
            canvas.drawText("No commissioning tests recorded yet.", MARGIN, y, mutedPaint)
            y += 16f
        } else {
            record.tests.take(8).forEach { test ->
                canvas.drawText("• ${test.testName.take(42)}", MARGIN, y, bodyPaint)
                canvas.drawText(test.measuredValue.take(28), 310f, y, bodyPaint)
                canvas.drawText(
                    if (test.passed) "PASS" else "FAIL",
                    PAGE_WIDTH - MARGIN - 36f,
                    y,
                    if (test.passed) passPaint else bodyPaint,
                )
                y += 15f
            }
        }
        y += 8f
        canvas.drawLine(MARGIN, y, PAGE_WIDTH - MARGIN, y, linePaint)
        y += 18f

        canvas.drawText("2. Registered QR Asset Serials & Warranty Coverage", MARGIN, y, titlePaint)
        y += 16f
        if (record.generatedAssets.isEmpty()) {
            canvas.drawText("QR assets are generated upon Commissioning Engineer approval.", MARGIN, y, mutedPaint)
            y += 16f
        } else {
            record.generatedAssets.take(8).forEach { asset ->
                canvas.drawText("${asset.qrCodeToken}  |  SN: ${asset.serialNumber}", MARGIN, y, bodyPaint)
                canvas.drawText("Warranty: ${asset.warrantyExpiresOn ?: "n/a"}", PAGE_WIDTH - MARGIN - 130f, y, mutedPaint)
                y += 15f
            }
        }
        y += 8f
        canvas.drawLine(MARGIN, y, PAGE_WIDTH - MARGIN, y, linePaint)
        y += 18f

        val handover = record.handoverDocuments.firstOrNull()
        canvas.drawText("3. Customer Handover Sign-Off & Certificate SHA-256 Digest", MARGIN, y, titlePaint)
        y += 16f
        canvas.drawText(
            "SHA-256: ${handover?.sha256Digest?.take(56) ?: "Pending engineer approval"}",
            MARGIN,
            y,
            mutedPaint,
        )
        y += 15f
        canvas.drawText(
            "Acknowledged By: ${handover?.customerSignoffName ?: "Awaiting customer signature"}   (${handover?.customerAcknowledgedAt ?: ""})",
            MARGIN,
            y,
            bodyPaint,
        )
        y += 14f

        if (signaturePngBytes != null && signaturePngBytes.isNotEmpty()) {
            val sigBitmap = BitmapFactory.decodeByteArray(signaturePngBytes, 0, signaturePngBytes.size)
            if (sigBitmap != null && y + 90f < PAGE_HEIGHT - MARGIN) {
                canvas.drawText("Customer Canvas Signature:", MARGIN, y + 12f, mutedPaint)
                val destRect = Rect(
                    MARGIN.toInt(),
                    (y + 18f).toInt(),
                    (MARGIN + 220f).toInt(),
                    (y + 98f).toInt(),
                )
                canvas.drawBitmap(sigBitmap, null, destRect, null)
            }
        }

        doc.finishPage(page)
        FileOutputStream(file).use { doc.writeTo(it) }
        doc.close()
        return file
    }

    fun renderPagePreview(pdfFile: File): Bitmap? {
        val pfd = ParcelFileDescriptor.open(pdfFile, ParcelFileDescriptor.MODE_READ_ONLY)
        pfd.use { descriptor ->
            val renderer = PdfRenderer(descriptor)
            renderer.use { r ->
                if (r.pageCount <= 0) return null
                val page = r.openPage(0)
                page.use { p ->
                    val bitmap = Bitmap.createBitmap(p.width * 2, p.height * 2, Bitmap.Config.ARGB_8888)
                    bitmap.eraseColor(Color.WHITE)
                    p.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                    return bitmap
                }
            }
        }
    }

    fun sharePdf(context: Context, pdfFile: File, certificateCode: String) {
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            pdfFile,
        )
        val sendIntent = Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, "VNex Solar Commissioning Certificate $certificateCode")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val chooser = Intent.createChooser(sendIntent, "Share Commissioning Certificate PDF").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooser)
    }

    fun printPdf(context: Context, pdfFile: File, jobName: String) {
        val printManager = context.getSystemService(Context.PRINT_SERVICE) as? PrintManager ?: return
        val adapter = object : PrintDocumentAdapter() {
            override fun onLayout(
                oldAttributes: PrintAttributes?,
                newAttributes: PrintAttributes?,
                cancellationSignal: CancellationSignal?,
                callback: LayoutResultCallback?,
                extras: Bundle?,
            ) {
                if (cancellationSignal?.isCanceled == true) {
                    callback?.onLayoutCancelled()
                    return
                }
                val info = PrintDocumentInfo.Builder(pdfFile.name)
                    .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                    .setPageCount(1)
                    .build()
                callback?.onLayoutFinished(info, true)
            }

            override fun onWrite(
                pages: Array<out PageRange>?,
                destination: ParcelFileDescriptor?,
                cancellationSignal: CancellationSignal?,
                callback: WriteResultCallback?,
            ) {
                if (destination == null) {
                    callback?.onWriteFailed("Missing destination file descriptor")
                    return
                }
                try {
                    FileInputStream(pdfFile).use { input ->
                        FileOutputStream(destination.fileDescriptor).use { output ->
                            input.copyTo(output)
                        }
                    }
                    callback?.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
                } catch (ex: Exception) {
                    callback?.onWriteFailed(ex.message ?: "Print failed")
                }
            }
        }
        printManager.print(jobName, adapter, PrintAttributes.Builder().build())
    }
}
