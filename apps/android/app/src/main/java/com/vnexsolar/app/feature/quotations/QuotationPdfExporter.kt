package com.vnexsolar.app.feature.quotations

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import androidx.core.content.FileProvider
import com.vnexsolar.app.core.model.DomainConstants
import com.vnexsolar.app.core.network.QuotationSummaryWrapperDto
import java.io.File
import java.io.FileOutputStream
import java.util.Locale

object QuotationPdfExporter {
    private const val PAGE_WIDTH = 595 // A4 width in points (72 dpi)
    private const val PAGE_HEIGHT = 842 // A4 height in points
    private const val MARGIN_X = 36f

    fun buildPdfDocument(
        context: Context,
        summary: QuotationSummaryWrapperDto,
        organizationName: String,
        customerName: String,
        projectTitle: String,
    ): PdfDocument {
        val doc = PdfDocument()
        val quotation = summary.quotation
        val revision = summary.latestRevision

        val titlePaint = Paint().apply {
            color = Color.parseColor("#0F172A")
            textSize = 18f
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
            isAntiAlias = true
        }
        val accentPaint = Paint().apply {
            color = Color.parseColor("#D97706")
            textSize = 11f
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
            isAntiAlias = true
        }
        val headerPaint = Paint().apply {
            color = Color.parseColor("#1E293B")
            textSize = 10f
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
            isAntiAlias = true
        }
        val bodyPaint = Paint().apply {
            color = Color.parseColor("#334155")
            textSize = 9.5f
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL)
            isAntiAlias = true
        }
        val monoPaint = Paint().apply {
            color = Color.parseColor("#0F172A")
            textSize = 9.5f
            typeface = Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL)
            isAntiAlias = true
        }
        val linePaint = Paint().apply {
            color = Color.parseColor("#CBD5E1")
            strokeWidth = 0.8f
        }
        val headerBgPaint = Paint().apply {
            color = Color.parseColor("#F1F5F9")
            style = Paint.Style.FILL
        }

        var pageNumber = 1
        var pageInfo = PdfDocument.PageInfo.Builder(PAGE_WIDTH, PAGE_HEIGHT, pageNumber).create()
        var page = doc.startPage(pageInfo)
        var canvas = page.canvas
        var y = 44f

        fun startNewPage() {
            doc.finishPage(page)
            pageNumber += 1
            pageInfo = PdfDocument.PageInfo.Builder(PAGE_WIDTH, PAGE_HEIGHT, pageNumber).create()
            page = doc.startPage(pageInfo)
            canvas = page.canvas
            y = 44f
            canvas.drawText(
                "${quotation.quotationNumber} (Rev ${quotation.currentRevisionNumber}) · Page $pageNumber",
                MARGIN_X,
                y,
                accentPaint,
            )
            y += 20f
        }

        // Top Branding Header
        canvas.drawText(organizationName.ifBlank { "VNex Solar Engineering" }, MARGIN_X, y, titlePaint)
        canvas.drawText("SOLAR EPC COMMERCIAL QUOTATION", MARGIN_X, y + 16f, accentPaint)
        canvas.drawText(quotation.quotationNumber, 430f, y, titlePaint)
        canvas.drawText("Status: ${quotation.status.uppercase(Locale.US)}", 430f, y + 16f, bodyPaint)
        y += 32f
        canvas.drawLine(MARGIN_X, y, PAGE_WIDTH - MARGIN_X, y, linePaint)
        y += 18f

        // Metadata Block
        canvas.drawText("Title: ${quotation.title}", MARGIN_X, y, headerPaint)
        y += 14f
        canvas.drawText("Customer: $customerName", MARGIN_X, y, bodyPaint)
        canvas.drawText("Currency: ${quotation.currency}", 390f, y, bodyPaint)
        y += 14f
        canvas.drawText("Project: $projectTitle", MARGIN_X, y, bodyPaint)
        canvas.drawText("Validity: ${revision?.validityDays ?: 15} days", 390f, y, bodyPaint)
        y += 20f

        // Table Header
        canvas.drawRect(MARGIN_X, y - 12f, PAGE_WIDTH - MARGIN_X, y + 6f, headerBgPaint)
        canvas.drawText("Type", MARGIN_X + 4f, y, headerPaint)
        canvas.drawText("Description", MARGIN_X + 68f, y, headerPaint)
        canvas.drawText("Qty", 326f, y, headerPaint)
        canvas.drawText("Unit Price", 374f, y, headerPaint)
        canvas.drawText("Tax", 452f, y, headerPaint)
        canvas.drawText("Total", 502f, y, headerPaint)
        y += 16f

        val items = revision?.items.orEmpty()
        for (item in items) {
            if (y > PAGE_HEIGHT - 140f) {
                startNewPage()
            }
            val qtyStr = if (item.quantity % 1.0 == 0.0) {
                item.quantity.toInt().toString()
            } else {
                String.format(Locale.US, "%.2f", item.quantity)
            }
            val desc = if (item.description.length > 36) item.description.take(33) + "..." else item.description
            val taxPct = String.format(Locale.US, "%.1f%%", item.taxRateBps / 100.0)
            val totalStr = DomainConstants.formatMinorCurrency(item.lineTotalMinor, quotation.currency)
            val unitStr = DomainConstants.formatMinorCurrency(item.unitPriceMinor, quotation.currency)

            canvas.drawText(item.lineType.uppercase(Locale.US).take(9), MARGIN_X + 4f, y, bodyPaint)
            canvas.drawText(desc, MARGIN_X + 68f, y, bodyPaint)
            canvas.drawText(qtyStr, 326f, y, monoPaint)
            canvas.drawText(unitStr, 374f, y, monoPaint)
            canvas.drawText(taxPct, 452f, y, monoPaint)
            canvas.drawText(totalStr, 502f, y, monoPaint)
            y += 15f
            canvas.drawLine(MARGIN_X, y - 5f, PAGE_WIDTH - MARGIN_X, y - 5f, linePaint)
            y += 4f
        }

        if (y > PAGE_HEIGHT - 180f) {
            startNewPage()
        }

        y += 10f
        if (revision != null) {
            val summaryLines = listOf(
                "Equipment & Material Subtotal" to DomainConstants.formatMinorCurrency(revision.equipmentSubtotalMinor, quotation.currency),
                "Labor & Engineering Services" to DomainConstants.formatMinorCurrency(revision.laborCostMinor, quotation.currency),
                "Transport & Logistics" to DomainConstants.formatMinorCurrency(revision.transportCostMinor, quotation.currency),
                "Commercial Discount" to "- ${DomainConstants.formatMinorCurrency(revision.discountMinor, quotation.currency)}",
                "Net Subtotal" to DomainConstants.formatMinorCurrency(revision.subtotalMinor, quotation.currency),
                "Applicable Sales Tax / GST" to DomainConstants.formatMinorCurrency(revision.taxAmountMinor, quotation.currency),
            )
            for ((label, value) in summaryLines) {
                canvas.drawText(label, 290f, y, bodyPaint)
                canvas.drawText(value, 470f, y, monoPaint)
                y += 14f
            }
            y += 4f
            canvas.drawLine(290f, y - 8f, PAGE_WIDTH - MARGIN_X, y - 8f, linePaint)
            canvas.drawText("TOTAL QUOTATION VALUE", 290f, y + 4f, headerPaint)
            canvas.drawText(
                DomainConstants.formatMinorCurrency(revision.totalAmountMinor, quotation.currency),
                470f,
                y + 4f,
                accentPaint,
            )
            y += 28f

            if (revision.termsAndConditions.isNotBlank()) {
                canvas.drawText("Terms & Payment Conditions", MARGIN_X, y, headerPaint)
                y += 14f
                revision.termsAndConditions.chunked(88).take(6).forEach { chunk ->
                    canvas.drawText(chunk, MARGIN_X, y, bodyPaint)
                    y += 12f
                }
            }
        }

        canvas.drawText(
            "Generated natively on Android · VNex Solar Business Management",
            MARGIN_X,
            PAGE_HEIGHT - 24f,
            bodyPaint,
        )

        doc.finishPage(page)
        return doc
    }

    fun exportPdfToCache(
        context: Context,
        summary: QuotationSummaryWrapperDto,
        organizationName: String,
        customerName: String,
        projectTitle: String,
    ): File {
        val exportDir = File(context.cacheDir, "exports").apply { mkdirs() }
        val safeCode = summary.quotation.quotationNumber.replace(Regex("[^A-Za-z0-9_-]"), "_")
        val file = File(exportDir, "${safeCode}_rev${summary.quotation.currentRevisionNumber}.pdf")
        val doc = buildPdfDocument(context, summary, organizationName, customerName, projectTitle)
        try {
            FileOutputStream(file).use { out ->
                doc.writeTo(out)
            }
        } finally {
            doc.close()
        }
        return file
    }

    fun renderFirstPageBitmap(pdfFile: File): Bitmap? {
        return runCatching {
            ParcelFileDescriptor.open(pdfFile, ParcelFileDescriptor.MODE_READ_ONLY).use { pfd ->
                PdfRenderer(pfd).use { renderer ->
                    if (renderer.pageCount <= 0) return@use null
                    renderer.openPage(0).use { page ->
                        val bitmap = Bitmap.createBitmap(
                            page.width * 2,
                            page.height * 2,
                            Bitmap.Config.ARGB_8888,
                        )
                        bitmap.eraseColor(Color.WHITE)
                        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
                        bitmap
                    }
                }
            }
        }.getOrNull()
    }

    fun shareQuotationPdf(
        context: Context,
        summary: QuotationSummaryWrapperDto,
        organizationName: String,
        customerName: String,
        projectTitle: String,
    ) {
        val file = exportPdfToCache(context, summary, organizationName, customerName, projectTitle)
        val uri: Uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file,
        )
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "application/pdf"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, "${summary.quotation.quotationNumber} - ${summary.quotation.title}")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        context.startActivity(Intent.createChooser(intent, "Share Quotation PDF"))
    }

    fun printQuotationPdf(
        context: Context,
        summary: QuotationSummaryWrapperDto,
        organizationName: String,
        customerName: String,
        projectTitle: String,
    ) {
        val printManager = context.getSystemService(Context.PRINT_SERVICE) as? PrintManager ?: return
        val file = exportPdfToCache(context, summary, organizationName, customerName, projectTitle)
        val jobName = "VNex_${summary.quotation.quotationNumber}"

        val adapter = object : PrintDocumentAdapter() {
            override fun onLayout(
                oldAttributes: PrintAttributes?,
                newAttributes: PrintAttributes,
                cancellationSignal: CancellationSignal?,
                callback: LayoutResultCallback,
                extras: Bundle?,
            ) {
                if (cancellationSignal?.isCanceled == true) {
                    callback.onLayoutCancelled()
                    return
                }
                val info = PrintDocumentInfo.Builder(file.name)
                    .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                    .setPageCount(PrintDocumentInfo.PAGE_COUNT_UNKNOWN)
                    .build()
                callback.onLayoutFinished(info, true)
            }

            override fun onWrite(
                pages: Array<out PageRange>?,
                destination: ParcelFileDescriptor,
                cancellationSignal: CancellationSignal?,
                callback: WriteResultCallback,
            ) {
                try {
                    file.inputStream().use { input ->
                        FileOutputStream(destination.fileDescriptor).use { output ->
                            input.copyTo(output)
                        }
                    }
                    callback.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
                } catch (ex: Exception) {
                    callback.onWriteFailed(ex.message)
                }
            }
        }
        printManager.print(jobName, adapter, PrintAttributes.Builder().build())
    }
}
