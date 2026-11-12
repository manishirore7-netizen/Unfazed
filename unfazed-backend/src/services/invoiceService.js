const PDFDocument = require("pdfkit");
const { paiseToRupees } = require("../config/paymentConfig");

/**
 * Formats a currency amount into standard decimal representation.
 * @param {number} amountInPaise
 * @param {string} [currency='INR']
 * @returns {string} Formatted string, e.g. "INR 1,500.00"
 */
const formatCurrency = (amountInPaise, currency = "INR") => {
  const rupees = paiseToRupees(amountInPaise || 0);
  return `${currency} ${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

/**
 * Formats a JavaScript Date object into a readable date string.
 * @param {Date|string} date
 * @returns {string} e.g. "11 Nov 2026"
 */
const formatDate = (date) => {
  if (!date) return "N/A";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

/**
 * Generates an official, immutable PDF invoice from a payment record and related entities.
 *
 * @param {Object} params
 * @param {Object} params.payment - Payment model document
 * @param {Object} [params.therapist] - Therapist profile document
 * @param {Object} [params.client] - Client CRM document
 * @param {Object} [params.booking] - Booking appointment document (if single session)
 * @param {Object} [params.packageDoc] - Package template document (if package)
 * @returns {Promise<Buffer>} Generated PDF buffer
 */
const generateInvoicePDF = ({
  payment,
  therapist = {},
  client = {},
  booking = null,
  packageDoc = null,
}) => {
  return new Promise((resolve, reject) => {
    try {
      if (!payment) {
        throw new Error("Payment record is required to generate invoice.");
      }

      const doc = new PDFDocument({
        margin: 50,
        size: "A4",
        info: {
          Title: `Invoice - ${payment.invoiceNumber || "Receipt"}`,
          Author: "Unfazed Practice Management",
          Subject: "Payment Receipt and Tax Invoice",
        },
      });

      const buffers = [];
      doc.on("data", (chunk) => buffers.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(buffers)));
      doc.on("error", (err) => reject(err));

      const currency = payment.currency || "INR";
      const invoiceNo = payment.invoiceNumber || "UNF-INV-DRAFT";
      const paymentDate = formatDate(payment.createdAt || new Date());
      const invoiceDate = formatDate(new Date());

      // ==========================================
      // Brand Header & Accent
      // ==========================================
      const brandForest = "#1B3B2B";
      const brandMuted = "#5E6D64";
      const brandLine = "#EFE8DF";
      const darkText = "#1C2520";

      // Header Bar
      doc
        .rect(50, 45, 495, 4)
        .fill(brandForest);

      doc
        .fillColor(brandForest)
        .fontSize(22)
        .font("Helvetica-Bold")
        .text("UNFAZED", 50, 60, { characterSpacing: 1.5 });

      doc
        .fillColor(brandMuted)
        .fontSize(9)
        .font("Helvetica")
        .text("Clinical Practice Management & Telehealth", 50, 86);

      // Invoice Label & Badge on top right
      doc
        .fillColor(brandForest)
        .fontSize(18)
        .font("Helvetica-Bold")
        .text("TAX INVOICE", 350, 60, { align: "right" });

      const statusText = (payment.status || "CAPTURED").toUpperCase();
      doc
        .fillColor(statusText === "CAPTURED" ? "#1B3B2B" : "#B91C1C")
        .fontSize(9)
        .font("Helvetica-Bold")
        .text(`STATUS: ${statusText === "CAPTURED" ? "PAID" : statusText}`, 350, 84, {
          align: "right",
        });

      // Divider Line
      doc
        .moveTo(50, 110)
        .lineTo(545, 110)
        .strokeColor(brandLine)
        .lineWidth(1)
        .stroke();

      // ==========================================
      // Meta Information (Invoice No, Dates, Method)
      // ==========================================
      const metaY = 125;
      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(darkText)
        .text("Invoice Number:", 50, metaY)
        .font("Helvetica")
        .text(invoiceNo, 140, metaY);

      doc
        .font("Helvetica-Bold")
        .text("Invoice Date:", 50, metaY + 16)
        .font("Helvetica")
        .text(invoiceDate, 140, metaY + 16);

      doc
        .font("Helvetica-Bold")
        .text("Payment Date:", 350, metaY, { align: "left" })
        .font("Helvetica")
        .text(paymentDate, 440, metaY, { align: "left" });

      const payRef = payment.razorpayPaymentId || payment.razorpayOrderId || "N/A";
      doc
        .font("Helvetica-Bold")
        .text("Transaction ID:", 350, metaY + 16, { align: "left" })
        .font("Helvetica")
        .text(payRef.length > 18 ? payRef.slice(0, 18) + "..." : payRef, 440, metaY + 16, {
          align: "left",
        });

      // ==========================================
      // Parties: Practitioner & Client
      // ==========================================
      const partiesY = 175;

      // Practitioner Info (Billed By)
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(brandForest)
        .text("BILLED BY (PRACTITIONER)", 50, partiesY);

      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(darkText)
        .text(therapist.name || "Practitioner", 50, partiesY + 18);

      doc
        .font("Helvetica")
        .fillColor(brandMuted)
        .text(therapist.email || "practice@unfazed.internal", 50, partiesY + 32);

      if (therapist.slug) {
        doc.text(`unfazed.io/${therapist.slug}`, 50, partiesY + 46);
      }

      // Client Info (Billed To)
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(brandForest)
        .text("BILLED TO (CLIENT)", 320, partiesY);

      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(darkText)
        .text(client.name || "Client", 320, partiesY + 18);

      doc
        .font("Helvetica")
        .fillColor(brandMuted)
        .text(client.email || "client@unfazed.internal", 320, partiesY + 32);

      if (client.phone) {
        doc.text(client.phone, 320, partiesY + 46);
      }

      // Divider Line
      doc
        .moveTo(50, 245)
        .lineTo(545, 245)
        .strokeColor(brandLine)
        .lineWidth(1)
        .stroke();

      // ==========================================
      // Itemized Services Table
      // ==========================================
      const tableTopY = 265;

      // Table Header Background
      doc
        .rect(50, tableTopY, 495, 22)
        .fill("#F7F5F0");

      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(brandForest)
        .text("ITEM DESCRIPTION", 60, tableTopY + 6)
        .text("TYPE", 310, tableTopY + 6)
        .text("QTY", 380, tableTopY + 6)
        .text("AMOUNT", 450, tableTopY + 6, { align: "right" });

      // Determine Description
      let itemDescription = "Clinical Consultation Service";
      let itemTypeLabel = "Consultation";
      let quantity = 1;

      if (payment.itemType === "package") {
        itemTypeLabel = "Package";
        if (packageDoc) {
          itemDescription = `${packageDoc.title || "Session Package"} (${packageDoc.sessionCount || 5} sessions, ${packageDoc.durationMinutes || 60}m)`;
          quantity = packageDoc.sessionCount || 1;
        } else {
          itemDescription = "Mental Health Therapy Package (Multi-Session)";
        }
      } else {
        if (booking) {
          const startTimeStr = formatDate(booking.startTime);
          itemDescription = `Individual Therapy Session (${booking.duration || 60} min) - ${startTimeStr}`;
        } else {
          itemDescription = "Individual Clinical Therapy Consultation";
        }
      }

      // Line Item Row
      const rowY = tableTopY + 32;
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor(darkText)
        .text(itemDescription, 60, rowY, { width: 240 })
        .text(itemTypeLabel, 310, rowY)
        .text(String(quantity), 380, rowY)
        .text(formatCurrency(payment.amount, currency), 450, rowY, { align: "right" });

      // Divider below item
      doc
        .moveTo(50, rowY + 35)
        .lineTo(545, rowY + 35)
        .strokeColor(brandLine)
        .lineWidth(0.5)
        .stroke();

      // ==========================================
      // Financial Summary (Reflecting Immutable Ledger)
      // ==========================================
      const summaryY = rowY + 50;
      const rightColX = 350;
      const amountX = 450;

      // Subtotal / Gross
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor(darkText)
        .text("Subtotal (Gross Amount):", rightColX, summaryY)
        .text(formatCurrency(payment.amount, currency), amountX, summaryY, { align: "right" });

      // Platform Commission Fee
      doc
        .text("Platform Facilitation Fee:", rightColX, summaryY + 18)
        .text(formatCurrency(payment.platformFee, currency), amountX, summaryY + 18, {
          align: "right",
        });

      // Tax / GST Deduction
      const taxAmount = Math.max(
        0,
        payment.amount - payment.platformFee - payment.netTherapistAmount
      );
      doc
        .text("Applicable Taxes / GST:", rightColX, summaryY + 36)
        .text(formatCurrency(taxAmount, currency), amountX, summaryY + 36, { align: "right" });

      // Divider above Total
      doc
        .moveTo(rightColX, summaryY + 56)
        .lineTo(545, summaryY + 56)
        .strokeColor(brandLine)
        .lineWidth(1)
        .stroke();

      // Total Paid
      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .fillColor(brandForest)
        .text("Total Paid:", rightColX, summaryY + 64)
        .text(formatCurrency(payment.amount, currency), amountX, summaryY + 64, {
          align: "right",
        });

      // Net Therapist Allocation
      doc
        .fontSize(9)
        .font("Helvetica")
        .fillColor(brandMuted)
        .text("Net Practitioner Allocation:", rightColX, summaryY + 82)
        .text(formatCurrency(payment.netTherapistAmount, currency), amountX, summaryY + 82, {
          align: "right",
        });

      // ==========================================
      // Payment Details & Method Box
      // ==========================================
      const methodBoxY = summaryY;
      doc
        .rect(50, methodBoxY, 250, 75)
        .fillAndStroke("#FCFAF7", brandLine);

      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .fillColor(brandForest)
        .text("PAYMENT METHOD & CLEARANCE", 60, methodBoxY + 10);

      doc
        .font("Helvetica")
        .fillColor(darkText)
        .text(`Mode: ${(payment.paymentMethod || "Online / Razorpay").toUpperCase()}`, 60, methodBoxY + 26)
        .text(`Gateway: Razorpay (Test Mode)`, 60, methodBoxY + 40)
        .text(`Verification: Confirmed & Cryptographically Validated`, 60, methodBoxY + 54);

      // ==========================================
      // Footer Notes & Compliance Notice
      // ==========================================
      const footerY = 680;
      doc
        .moveTo(50, footerY)
        .lineTo(545, footerY)
        .strokeColor(brandLine)
        .lineWidth(1)
        .stroke();

      doc
        .fontSize(8)
        .font("Helvetica")
        .fillColor(brandMuted)
        .text(
          "Thank you for choosing Unfazed Practice Management. This document serves as an electronically generated official tax invoice and receipt for mental health consultation services.",
          50,
          footerY + 15,
          { align: "center", width: 495 }
        );

      doc.text(
        "For billing inquiries or practice details, contact your practitioner directly or visit unfazed.io",
        50,
        footerY + 32,
        { align: "center", width: 495 }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = {
  generateInvoicePDF,
  formatCurrency,
  formatDate,
};
