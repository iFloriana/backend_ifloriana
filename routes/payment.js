// payment.js
const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");

const Appointment = require("../models/Appointment");
const Payment = require("../models/Payment");
const CustomerPackage = require("../models/CustomerPackage");
const Coupon = require("../models/Coupon");
const Tax = require("../models/Tax");
const Salon = require("../models/Salon");
const Branch = require("../models/Branch");
const Customer = require("../models/Customer");
const CustomerMembership = require("../models/CustomerMembership");
const mongoose = require("mongoose");

const uploadsDir = path.join(__dirname, "../uploads");

function normalizeId(id) {
  if (!id) return null;
  return typeof id === "object" && id._id ? id._id.toString() : id.toString();
}

function formatCurrency(value) {
  return `Rs. ${value.toFixed(2)}`;
}

async function generateFullPageInvoice(doc, data) {
  await Appointment.findByIdAndUpdate(data.appointment_id, { payment_status: "Paid" });

  const branch = data.appointment.branch_id || {};
  const salon = data.appointment.salon_id || {};

  // === HEADER ===
  doc.font('Helvetica-Bold').fontSize(22).text(salon?.salon_name || "Your Salon Name", { align: "center" });
  doc.font('Helvetica').fontSize(14).text(branch?.name || "", { align: "center" });
  doc.fontSize(12).text(branch?.address || "", { align: "center" });
  doc.text(`Phone: ${branch?.contact_number || salon?.contact_number || "-"}`, { align: "center" });
  doc.text(`Email: ${branch?.contact_email || salon?.contact_email || "-"}`, { align: "center" });
  doc.moveDown();

  doc.fontSize(16).text("Payment Invoice", { align: "center", underline: true });
  doc.moveDown();

  doc.fontSize(11);
  doc.text(`Invoice ID: ${data.invoiceFileName.replace(".pdf", "")}`);
  doc.text(`Customer: ${data.customer.full_name}`);
  doc.text(`Phone: ${data.customer.phone_number || "-"}`);
  doc.text(`Date: ${data.now.toLocaleString()}`);
  doc.text(`Appointment Date: ${new Date(data.appointment.appointment_date).toLocaleDateString()}`);
  doc.text(`Appointment Time: ${data.appointment.appointment_time || "-"}`);
  doc.text(`Payment Method: ${data.payment_method}`);
  doc.moveDown();

  // === SERVICES ===
  doc.fontSize(13).text("Services", { underline: true });
  if (data.services.length > 0) {
    data.services.forEach(svc => {
      const name = svc.service_id?.name || "-";
      const price = svc.used_package ? 0 : (svc.service_amount || 0);
      const label = svc.used_package ? "(from package)" : "";
      doc.fontSize(11).text(`Service: ${name} - Rs. ${price.toFixed(2)} ${label}`);
    });
  } else {
    doc.fontSize(11).text("No services.");
  }
  doc.moveDown();

  // === PRODUCTS ===
  doc.fontSize(13).text("Products", { underline: true });
  if (data.appointment.products?.length > 0) {
    data.appointment.products.forEach(prod => {
      doc.fontSize(11).text(
        `Product: ${prod.product_id?.product_name || prod.name || "-"} x${prod.quantity || 1} - Rs. ${(prod.total_price || 0).toFixed(2)}`
      );
    });
  } else {
    doc.fontSize(11).text("No products.");
  }
  doc.moveDown();

  // === PURCHASED ITEMS (Package / Membership) ===
  let purchasedItems = [];
  if (data.package_amount > 0) {
    purchasedItems.push(`Package Purchase - Rs. ${data.package_amount.toFixed(2)}`);
  }
  if (data.membership_amount > 0) {
    purchasedItems.push(`Membership Purchase - Rs. ${data.membership_amount.toFixed(2)}`);
  }
  if (purchasedItems.length) {
    doc.fontSize(13).text("Purchased Items", { underline: true });
    purchasedItems.forEach(item => doc.fontSize(11).text(item));
    doc.moveDown();
  }

  // === CHARGES SUMMARY ===
  doc.fontSize(13).text("Charges Summary", { underline: true });
  doc.fontSize(11)
    .text(`Service Amount: Rs. ${(data.service_amount || 0).toFixed(2)}`)
    .text(`Product Amount: Rs. ${(data.product_amount || 0).toFixed(2)}`)
    .text(`Package Amount: Rs. ${(data.package_amount || 0).toFixed(2)}`)
    .text(`Membership Amount: Rs. ${(data.membership_amount || 0).toFixed(2)}`)
    .text(`Coupon Discount: -Rs. ${(data.coupon_discount || 0).toFixed(2)}`)
    .text(`Additional Discount: -Rs. ${(data.final_additional_discount || 0).toFixed(2)}${data.additional_discount_type === "percentage" ? ` (${data.additional_discount || 0}%)` : ""}`)
    .text(`Membership Discount: -Rs. ${(data.membership_discount || 0).toFixed(2)}`)
    .text(`Additional Charges: Rs. ${(data.additional_charges || 0).toFixed(2)}`)
    .text(`Tax: Rs. ${(data.tax_amount || 0).toFixed(2)}`)
    .text(`Tips: Rs. ${(data.tips || 0).toFixed(2)}`);
  doc.moveDown();

  doc.fontSize(12).text(`Subtotal: Rs. ${data.sub_total.toFixed(2)}`, { align: "right" });
  doc.fontSize(13).text(`Grand Total Payable: Rs. ${data.total.toFixed(2)}`, { align: "right" });
  doc.moveDown(2);

  doc.fontSize(9).text("Thank you for choosing us!", { align: "center" });
  doc.text("This is a system-generated invoice.", { align: "center" });
}

async function generateReceiptInvoice(doc, data) {
  // Header
  doc.fontSize(14).text(data.appointment.salon_id?.salon_name || "Your Salon Name", { align: "center" });
  doc.fontSize(10).text(data.appointment.branch_id?.name || "", { align: "center" });
  doc.text(`Phone: ${data.appointment.branch_id?.contact_number || data.appointment.salon_id?.contact_number || "-"}`, { align: "center" });
  doc.text(`Email: ${data.appointment.branch_id?.contact_email || data.appointment.salon_id?.contact_email || "-"}`, { align: "center" });
  doc.moveDown(0.5);

  // Invoice title
  doc.fontSize(12).text("Payment Invoice", { align: "center", underline: true });
  doc.moveDown(0.5);

  // Basic info
  doc.fontSize(10).text(`Invoice ID: ${data.invoiceFileName.replace(".pdf", "")}`);
  doc.text(`Customer: ${data.customer.full_name}`);
  doc.text(`Phone: ${data.customer.phone_number || "-"}`);
  doc.text(`Date: ${data.now.toLocaleString()}`);

  // add here
  doc.text(`Appointment Date: ${new Date(data.appointment.appointment_date).toLocaleDateString()}`);
  doc.text(`Appointment Time: ${data.appointment.appointment_time || "-"}`);

  doc.text(`Payment Method: ${data.payment_method}`);
  doc.moveDown(0.5);

  // Services
  doc.fontSize(10).text("Services", { underline: true });
  if (data.services.length > 0) {
    data.services.forEach(svc => {
      const price = svc.used_package ? 0 : (svc.service_amount || 0);
      const label = svc.used_package ? "(from package)" : "";
      doc.text(`${svc.service_id?.name || "-"} - Rs. ${price.toFixed(2)} ${label}`);
    });
  } else {
    doc.text("No services.");
  }
  doc.moveDown(0.5);

  // Products
  doc.fontSize(10).text("Products", { underline: true });
  if (data.appointment.products?.length > 0) {
    data.appointment.products.forEach(prod => {
      doc.text(`${prod.product_id?.product_name || prod.name || "-"} x${prod.quantity || 1} - Rs. ${(prod.total_price || 0).toFixed(2)}`);
    });
  } else {
    doc.text("No products.");
  }
  doc.moveDown(0.5);

  // Charges Summary
  // Purchased Items section
  let purchasedItems = [];
  if (data.appointment.branch_package) {
    const BranchPackage = require("../models/BranchPackage");
    const pkg = await BranchPackage.findById(data.appointment.branch_package);
    if (pkg) {
      purchasedItems.push(`Package: ${pkg.package_name} - Rs. ${(pkg.package_price || 0).toFixed(2)}`);
    }
  }
  if (data.appointment.branch_membership) {
    const BranchMembership = require("../models/BranchMembership");
    const membership = await BranchMembership.findById(data.appointment.branch_membership);
    if (membership) {
      purchasedItems.push(`Membership: ${membership.membership_name} - Rs. ${(membership.membership_amount || 0).toFixed(2)}`);
    }
  }
  if (purchasedItems.length) {
    doc.fontSize(10).text("Purchased Items", { underline: true });
    purchasedItems.forEach(item => doc.fontSize(10).text(item));
    doc.moveDown();
  }
  doc.fontSize(10).text("Charges Summary", { underline: true });
  doc.text(`Service Amount: Rs. ${(data.service_amount || 0).toFixed(2)}`);
  doc.text(`Product Amount: Rs. ${(data.product_amount || 0).toFixed(2)}`);
  doc.text(`Package Amount: Rs. ${(data.package_amount || 0).toFixed(2)}`);
  doc.text(`Membership Amount: Rs. ${(data.membership_amount || 0).toFixed(2)}`);
  doc.text(`Coupon Discount: -Rs. ${(data.coupon_discount || 0).toFixed(2)}`);
  doc.text(`Additional Discount: -Rs. ${(data.final_additional_discount || 0).toFixed(2)}${data.additional_discount_type === "percentage" ? ` (${data.additional_discount || 0}%)` : ""}`);
  doc.text(`Membership Discount: -Rs. ${(data.membership_discount || 0).toFixed(2)}`);
  doc.text(`Additional Charges: Rs. ${(data.additional_charges || 0).toFixed(2)}`);
  doc.text(`Tax: Rs. ${(data.tax_amount || 0).toFixed(2)}`);
  doc.text(`Tips: Rs. ${(data.tips || 0).toFixed(2)}`);
  doc.moveDown(0.5);

  // Totals
  doc.fontSize(10).text(`Subtotal: Rs. ${data.sub_total.toFixed(2)}`, { align: "right" });
  doc.fontSize(12).text(`Grand Total Payable: Rs. ${data.total.toFixed(2)}`, { align: "right" });
  doc.moveDown(1);

  doc.fontSize(8).text("Thank you for choosing us!", { align: "center" });
  doc.text("This is a system-generated invoice.", { align: "center" });
}

async function generateHalfPageInvoice(doc, data) {
  const salon = data.appointment.salon_id || {};
  const branch = data.appointment.branch_id || {};

  // ==== HEADER ====
  doc.font('Helvetica-Bold').fontSize(18).text(salon?.salon_name || "Your Salon Name", 50, 40);
  doc.font('Helvetica').fontSize(10).text(branch?.address || "-", 50);
  doc.text(`Phone: ${branch?.contact_number || salon?.contact_number || "-"}`, 50);
  doc.text(`Email: ${branch?.contact_email || salon?.contact_email || "-"}`, 50);

  doc.font('Helvetica-Bold').fontSize(18).text("INVOICE", 400, 40);
  doc.font('Helvetica').fontSize(10).text(`Date: ${data.now.toLocaleDateString()}`, 400);
  doc.text(`Invoice #: ${data.invoiceFileName.replace(".pdf", "")}`, 400);

  // add here
  doc.text(`Appointment Date: ${new Date(data.appointment.appointment_date).toLocaleDateString()}`);
  doc.text(`Appointment Time: ${data.appointment.appointment_time || "-"}`);

  doc.moveDown(2);

  // ==== BILL TO ====
  doc.font('Helvetica-Bold').text('BILL TO:', 50);
  doc.font('Helvetica').text(data.customer.full_name || "-", 50);
  doc.text(data.customer.phone_number || "-", 50);

  doc.moveDown(1.5);

  // ==== TABLE HEADER ====
  const colWidths = { desc: 220, qty: 60, unit: 80, total: 80 };
  const colX = { desc: 50, qty: 270, unit: 340, total: 430 };

  // Define a single, consistent vertical position for the headers
  const headerY = 175; // Adjust this value as needed for your document

  // Set the font for the headers
  doc.font('Helvetica-Bold');

  // Place each header at the correct horizontal (X) and vertical (Y) position
  doc.text('Description', colX.desc, headerY, { width: colWidths.desc, align: 'left' });
  doc.text('Qty', colX.qty, headerY, { width: colWidths.qty, align: 'center' });
  doc.text('Unit Price', colX.unit, headerY, { width: colWidths.unit, align: 'right' });
  doc.text('Total', colX.total, headerY, { width: colWidths.total, align: 'right' });

  // Add a line below the headers for visual separation
  doc.moveDown(0.2);
  doc.strokeColor('#000').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();

  // ==== TABLE ROWS ====
  doc.font('Helvetica').fontSize(10);
  doc.moveDown(1);

  // Services
  if (data.services?.length > 0) {
    data.services.forEach(svc => {
      const price = svc.used_package ? 0 : (svc.service_amount || 0);
      const rowY = doc.y;
      doc.text(svc.service_id?.name || "-", colX.desc, rowY);
      doc.text("1", colX.qty, rowY);
      doc.text(`Rs. ${price.toFixed(2)}`, colX.unit, rowY, { width: 80, align: 'right' });
      doc.text(`Rs. ${price.toFixed(2)}`, colX.total, rowY, { width: 80, align: 'right' });
      doc.moveDown();
    });
  }

  // Products
  if (data.appointment.products?.length > 0) {
    data.appointment.products.forEach(prod => {
      const name = prod.product_id?.product_name || prod.name || "-";
      const qty = prod.quantity || 1;
      const unitPrice = (prod.total_price || 0) / qty;
      const rowY = doc.y;
      doc.text(name, colX.desc, rowY);
      doc.text(qty.toString(), colX.qty, rowY);
      doc.text(`Rs. ${unitPrice.toFixed(2)}`, colX.unit, rowY, { width: 80, align: 'right' });
      doc.text(`Rs. ${(prod.total_price || 0).toFixed(2)}`, colX.total, rowY, { width: 80, align: 'right' });
      doc.moveDown();
    });
  }

  doc.moveDown(0.5);
  doc.strokeColor('#000').lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown(0.5);

  // Purchased Items section
  let purchasedItems = [];
  if (data.appointment.branch_package) {
    const BranchPackage = require("../models/BranchPackage");
    const pkg = await BranchPackage.findById(data.appointment.branch_package);
    if (pkg) {
      purchasedItems.push(`Package: ${pkg.package_name} - Rs. ${(pkg.package_price || 0).toFixed(2)}`);
    }
  }
  if (data.appointment.branch_membership) {
    const BranchMembership = require("../models/BranchMembership");
    const membership = await BranchMembership.findById(data.appointment.branch_membership);
    if (membership) {
      purchasedItems.push(`Membership: ${membership.membership_name} - Rs. ${(membership.membership_amount || 0).toFixed(2)}`);
    }
  }
  if (purchasedItems.length) {
    doc.fontSize(10).text("Purchased Items", { underline: true });
    purchasedItems.forEach(item => doc.fontSize(10).text(item));
    doc.moveDown();
  }
  // ==== CHARGES SUMMARY ====
  const labelX = 320;
  const valueX = 500;

  const summaryItems = [
    ["Service Amount:", data.service_amount || 0],
    ["Product Amount:", data.product_amount || 0],
    ["Package Amount:", data.package_amount || 0],
    ["Membership Amount:", data.membership_amount || 0],
    ["Coupon Discount:", -(data.coupon_discount || 0)],
    ["Additional Discount:", -(data.final_additional_discount || 0)],
    ["Membership Discount:", -(data.membership_discount || 0)],
    ["Additional Charges:", data.additional_charges || 0],
    ["Tax:", data.tax_amount || 0],
    ["Tips:", data.tips || 0],
    ["Subtotal:", data.sub_total || 0],
    ["Grand Total Payable:", data.total || 0],   // ✅ Correct
  ];

  summaryItems.forEach(([label, value]) => {
    const y = doc.y;
    doc.font('Helvetica-Bold').text(label, labelX, y);
    doc.font('Helvetica').text(`Rs. ${(value).toFixed(2)}`, valueX, y, { width: 80, align: 'right' });
    doc.moveDown();
  });
}

// === Number to Words Helper (simple) ===
function numberToWords(num) {
  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven",
    "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen",
    "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const inWords = (n) => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
    if (n < 1000) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + inWords(n % 100) : "");
    if (n < 100000) return inWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + inWords(n % 1000) : "");
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + inWords(n % 100000) : "");
    return inWords(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + inWords(n % 10000000) : "");
  };

  return inWords(num) || "Zero";
}

// === GST Table Drawer ===
function drawTaxSummaryTable(doc, startY, data) {
  const colX = [50, 150, 250, 310, 360, 420, 480];
  let y = startY;

  // Header
  doc.font('Helvetica-Bold').fontSize(9);
  doc.text("HSN/SAC", colX[0], y);
  doc.text("Taxable Value", colX[1], y);
  doc.text("CGST Rate", colX[2], y);
  doc.text("CGST Amt", colX[3], y);
  doc.text("SGST Rate", colX[4], y);
  doc.text("SGST Amt", colX[5], y);
  doc.text("Total Tax Amt", colX[6], y);

  y += 15;
  doc.moveTo(50, y).lineTo(550, y).stroke();

  // Body
  doc.font('Helvetica').fontSize(9);

  const taxableValue = (data.service_amount || 0) +
    (data.product_amount || 0) +
    (data.package_amount || 0) +
    (data.membership_amount || 0);

  let cgstRate = 0, sgstRate = 0, cgstAmt = 0, sgstAmt = 0;
  if (data.tax_details && data.tax_details.length > 0) {
    data.tax_details.forEach(tax => {
      if (tax.type === "CGST") { cgstRate = tax.rate; cgstAmt = tax.amount; }
      if (tax.type === "SGST") { sgstRate = tax.rate; sgstAmt = tax.amount; }
    });
  }

  const totalTax = cgstAmt + sgstAmt;

  doc.text("-", colX[0], y + 5);
  doc.text(taxableValue.toFixed(2), colX[1], y + 5);
  doc.text(`${cgstRate}%`, colX[2], y + 5);
  doc.text(cgstAmt.toFixed(2), colX[3], y + 5);
  doc.text(`${sgstRate}%`, colX[4], y + 5);
  doc.text(sgstAmt.toFixed(2), colX[5], y + 5);
  doc.text(totalTax.toFixed(2), colX[6], y + 5);

  y += 20;
  doc.moveTo(50, y).lineTo(550, y).stroke();

  // Totals
  doc.font('Helvetica-Bold').fontSize(9);
  doc.text("Total", colX[0], y + 5);
  doc.text(taxableValue.toFixed(2), colX[1], y + 5);
  doc.text(cgstAmt.toFixed(2), colX[3], y + 5);
  doc.text(sgstAmt.toFixed(2), colX[5], y + 5);
  doc.text(totalTax.toFixed(2), colX[6], y + 5);

  return y + 40;
}

// === MAIN INVOICE ===
async function generateGSTInvoice(doc, data) {
  await Appointment.findByIdAndUpdate(data.appointment_id, { payment_status: "Paid" });

  const branch = data.appointment.branch_id || {};
  const salon = data.appointment.salon_id || {};

  // ==== HEADER ====
  doc.font('Helvetica-Bold').fontSize(16).text(salon?.salon_name || "Your Salon", 50, 50);
  doc.font('Helvetica').fontSize(10)
    .text(branch?.address || "-", 50, 70)
    .text(`Phone: ${branch?.contact_number || salon?.contact_number || "-"}`, 50, 85)
    .text(`Email: ${branch?.contact_email || salon?.contact_email || "-"}`, 50, 100)
    .text(`GSTIN: ${salon?.gst_number || "-"}`, 50, 115);   // ✅ Added line

  doc.font('Helvetica-Bold').fontSize(10);
  doc.text(`Invoice No: ${data.invoiceFileName.replace(".pdf", "")}`, 400, 50);
  doc.text(`Invoice Date: ${data.now.toLocaleDateString()}`, 400, 65);

  doc.moveDown(3);

  // ==== BILL TO ====
  doc.fontSize(11).font('Helvetica-Bold').text("Bill To:", 50, 140);
  doc.font('Helvetica').fontSize(10)
    .text(`${data.customer.full_name}`, 50, 155)
    .text(`${data.customer.phone_number || "-"}`, 50, 170);

  // ==== ITEMS TABLE ====
  let tableTop = 200;
  const itemX = [50, 80, 250, 300, 360, 420];

  doc.font('Helvetica-Bold').fontSize(10);
  doc.text("S.No", itemX[0], tableTop);
  doc.text("Item", itemX[1], tableTop);
  doc.text("Qty", itemX[2], tableTop);
  doc.text("Rate", itemX[3], tableTop);
  doc.text("Disc", itemX[4], tableTop);
  doc.text("Amount", itemX[5], tableTop);

  doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

  let i = 1;
  let rowTop = tableTop + 25;

  const addRow = (sno, name, qty, rate, disc, amount, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
    doc.text(sno || "", itemX[0], rowTop);
    doc.text(name, itemX[1], rowTop);
    doc.text(qty || "-", itemX[2], rowTop);
    doc.text(rate !== undefined ? rate : "-", itemX[3], rowTop);
    doc.text(disc !== undefined ? disc : "-", itemX[4], rowTop);
    doc.text(amount !== undefined ? amount : "-", itemX[5], rowTop);
    rowTop += 20;
  };

  // === SERVICES ===
  if (data.services?.length > 0) {
    data.services.forEach(svc => {
      const name = svc.service_id?.name || "-";
      const price = svc.used_package ? 0 : (svc.service_amount || 0);
      const disc = svc.used_package ? "100%" : "0%";
      addRow(i, name, 1, price.toFixed(2), disc, price.toFixed(2));
      i++;
    });
  }

  // === PRODUCTS ===
  if (data.appointment.products?.length > 0) {
    data.appointment.products.forEach(prod => {
      const unitPrice =
        prod.price ||
        prod.product_id?.price ||
        (prod.total_price && prod.quantity ? prod.total_price / prod.quantity : 0);

      addRow(
        i,
        prod.product_id?.product_name || prod.name || "-",
        prod.quantity || 1,
        unitPrice.toFixed(2),
        "-",
        (prod.total_price || 0).toFixed(2)
      );
      i++;
    });
  }

  // === PACKAGE & MEMBERSHIP PURCHASE ===
  if (data.package_amount > 0) {
    addRow(i, "Package Purchase", 1, data.package_amount.toFixed(2), "0%", data.package_amount.toFixed(2));
    i++;
  }
  if (data.membership_amount > 0) {
    addRow(i, "Membership Purchase", 1, data.membership_amount.toFixed(2), "0%", data.membership_amount.toFixed(2));
    i++;
  }

  // === DISCOUNTS (in Disc column) ===
  if (data.coupon_discount > 0) addRow("", "Coupon Discount", "-", "-", data.coupon_discount.toFixed(2), "-");
  if (data.final_additional_discount > 0) addRow("", "Additional Discount", "-", "-", data.final_additional_discount.toFixed(2), "-");
  if (data.membership_discount > 0) addRow("", "Membership Discount", "-", "-", data.membership_discount.toFixed(2), "-");

  // === ADDITIONS (in Rate column) ===
  if (data.additional_charges > 0) addRow("", "Additional Charges", "-", data.additional_charges.toFixed(2), "-", "-");

  // Taxes (still show inside item table)
  if (data.tax_details?.length > 0) {
    data.tax_details.forEach(tax => {
      addRow("", tax.type, "-", tax.amount.toFixed(2), "-", "-");
    });
  }

  if (data.tips > 0) addRow("", "Tips", "-", data.tips.toFixed(2), "-", "-");

  // === SUBTOTAL & GRAND TOTAL ===
  addRow("", "Subtotal", "-", "-", "-", data.sub_total.toFixed(2), true);
  addRow("", "Grand Total", "-", "-", "-", data.total.toFixed(2), true);

  // ==== GST SUMMARY TABLE ====
  let nextY = drawTaxSummaryTable(doc, rowTop + 10, data);

  // ==== AMOUNT IN WORDS ====
  doc.font('Helvetica').fontSize(9)
    .text(`Total Amount (in words): ${numberToWords(data.total)} Rupees Only`, 50, nextY + 10);

  // ==== FOOTER ====
  doc.fontSize(9).font('Helvetica-Oblique')
    .text("This is a system-generated invoice", 50, nextY + 40, { align: "center" });
}

router.post("/", async (req, res) => {
  try {
    const {
      appointment_id,
      payment_method,
      invoice_format = "gst_invoice",
      coupon_id,
      tax_id,
      additional_discount = 0,
      additional_discount_type = "flat",
      additional_charges = 0,
      tips = 0,
      payment_split = []
    } = req.body;

    const cleanCouponId = coupon_id || undefined;
    const cleanTaxId = tax_id || undefined;

    const safeNumber = (val) =>
      typeof val === "number" && !isNaN(val) ? val : 0;

    // ===== GET APPOINTMENT DATA =====
    const appointment = await Appointment.findById(appointment_id)
      .populate("customer_id")
      .populate("salon_id")
      .populate("branch_id")
      .populate("services.service_id")
      .populate("products.product_id");

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    const salon_id = appointment.salon_id?._id || appointment.salon_id;
    const branch_id = appointment.branch_id?._id || appointment.branch_id;
    const customer_id = appointment.customer_id?._id || appointment.customer_id;
    const services = appointment.services || [];

    // ===== SERVICE & PRODUCT AMOUNTS =====
    let service_amount = 0;
    let updatedServices = [];

    for (const s of appointment.services) {
      let svcAmount = safeNumber(s.service_amount);

      let used_package = false;

      // ===== Check if service is from active package =====
      const activePackages = await CustomerPackage.find({
        customer_id,
        salon_id,
        status: 1,
        $or: [{ end_date: null }, { end_date: { $gte: new Date() } }],
      });

      for (const pkg of activePackages) {
        const serviceInPkg = pkg.package_details.find(
          (item) =>
            item.service_id.toString() ===
            (s.service_id?._id?.toString() || s.service_id.toString()) &&
            item.quantity > 0
        );

        if (serviceInPkg) {
          svcAmount = 0; // always free if from package
          used_package = true;
          break;
        }
      }

      service_amount += svcAmount;

      updatedServices.push({
        ...s.toObject(),
        service_amount: svcAmount,
        used_package,
      });
    }

    // ✅ Update appointment services with corrected amounts (for invoice display only)
    appointment.services = updatedServices;
    await appointment.save();

    let product_amount =
      appointment.products?.reduce(
        (sum, p) => sum + safeNumber(p.total_price),
        0
      ) || 0;

    // ===== PACKAGE & MEMBERSHIP PURCHASES (if any) =====
    let package_amount = 0;
    let membership_amount = 0;

    // ===== PACKAGE AMOUNT =====
    if (appointment.branch_package) {
      const CustomerPackage = require("../models/CustomerPackage");
      const BranchPackage = require("../models/BranchPackage");
      const custPkg = await CustomerPackage.findById(appointment.branch_package);
      if (custPkg) {
        const branchPkg = await BranchPackage.findById(custPkg.branch_package_id[0]);
        if (branchPkg) package_amount = safeNumber(branchPkg.package_price);
      }
    }

    // ===== MEMBERSHIP AMOUNT =====
    if (appointment.branch_membership) {
      const CustomerMembership = require("../models/CustomerMembership");
      const BranchMembership = require("../models/BranchMembership");
      const custMem = await CustomerMembership.findById(appointment.branch_membership);
      if (custMem) {
        const branchMem = await BranchMembership.findById(custMem.branch_membership);
        if (branchMem) membership_amount = safeNumber(branchMem.membership_amount);
      }
    }

    // ===== STEP 1: BASE AMOUNT =====
    let base_amount = service_amount + safeNumber(additional_charges);

    // ===== STEP 2: MEMBERSHIP DISCOUNT =====
    let membership_discount = 0;
    const customer = await Customer.findById(customer_id);
    const today = new Date();

    if (
      customer?.branch_membership &&
      customer?.branch_membership_valid_till &&
      new Date(customer.branch_membership_valid_till) >= today
    ) {
      const BranchMembership = require("../models/BranchMembership");
      const branchMembership = await BranchMembership.findById(
        customer.branch_membership
      );
      if (branchMembership?.discount) {
        const membershipDiscountPercentage = safeNumber(branchMembership.discount);
        membership_discount = (base_amount * membershipDiscountPercentage) / 100;
      }
    }

    let after_membership = base_amount - membership_discount;

    // ===== STEP 3: COUPON DISCOUNT =====
    let coupon_discount = 0;
    if (cleanCouponId) {
      const coupon = await Coupon.findById(cleanCouponId);
      if (coupon) {
        if (coupon.discount_type === "percent") {
          coupon_discount = (after_membership * safeNumber(coupon.discount_amount)) / 100;
        } else {
          coupon_discount = safeNumber(coupon.discount_amount);
        }
      }
    }
    let after_coupon = after_membership - coupon_discount;

    // ===== STEP 4: ADDITIONAL DISCOUNT =====
    let final_additional_discount = 0;
    if (additional_discount_type === "percentage") {
      final_additional_discount = (after_coupon * safeNumber(additional_discount)) / 100;
    } else {
      final_additional_discount = safeNumber(additional_discount);
    }

    let sub_total = after_coupon - final_additional_discount;

    // ===== STEP 5: TAX =====
    let tax_amount = 0;
    if (cleanTaxId) {
      const tax = await Tax.findById(cleanTaxId);
      if (tax && tax.value != null) {
        const taxValue = Number(tax.value);
        if (!isNaN(taxValue)) {
          if (tax.type === "percent") {
            tax_amount = (sub_total * taxValue) / 100;
          } else if (tax.type === "fixed") {
            tax_amount = taxValue;
          }
        }
      }
    }

    // ===== SPLIT TAX (CGST + SGST) =====
    let tax_details = [];

    if (tax_amount > 0 && cleanTaxId) {
      const tax = await Tax.findById(cleanTaxId);
      if (tax && tax.type === "percent") {
        const halfRate = Number(tax.value) / 2;
        const halfAmount = tax_amount / 2;

        tax_details = [
          { type: "CGST", rate: halfRate, amount: halfAmount },
          { type: "SGST", rate: halfRate, amount: halfAmount },
        ];
      } else {
        // For fixed tax, you may log as CGST only or adjust accordingly
        tax_details = [
          { type: "CGST", rate: 0, amount: tax_amount },
        ];
      }
    }

    let final_total = sub_total + tax_amount;

    // ===== STEP 6: ADD EVERYTHING =====
    // Include products, package, membership, and tips in final_total directly
    final_total += safeNumber(product_amount) + safeNumber(package_amount) + safeNumber(membership_amount) + safeNumber(tips);

    // Keep total in sync (alias of final_total for clarity)
    let total = final_total;

    // ===== ROUNDING TO 2 DECIMALS =====
    service_amount = Number(service_amount.toFixed(2));
    product_amount = Number(product_amount.toFixed(2));
    membership_discount = Number(membership_discount.toFixed(2));
    coupon_discount = Number(coupon_discount.toFixed(2));
    final_additional_discount = Number(final_additional_discount.toFixed(2));
    sub_total = Number(sub_total.toFixed(2));
    tax_amount = Number(tax_amount.toFixed(2));
    final_total = Number(final_total.toFixed(2));
    total = Number(total.toFixed(2));

    // ===== HANDLE SPLIT PAYMENTS =====
    let processed_split = [];
    if (payment_method === "Split") {
      if (!Array.isArray(payment_split) || payment_split.length === 0) {
        return res
          .status(400)
          .json({ message: "Payment split details are required for split payments" });
      }

      let totalSplit = payment_split.reduce(
        (sum, p) => sum + safeNumber(p.amount),
        0
      );

      if (Number(totalSplit.toFixed(2)) !== total) {
        return res.status(400).json({
          message: `Split total (${totalSplit}) does not match total (${total})`,
        });
      }

      for (let split of payment_split) {
        if (!["cash", "card", "upi"].includes(split.method.toLowerCase())) {
          return res
            .status(400)
            .json({ message: `Invalid payment method in split: ${split.method}` });
        }
      }

      processed_split = payment_split.map((s) => ({
        method: s.method.toLowerCase(),
        amount: safeNumber(s.amount),
      }));
    }

    // ===== CREATE PAYMENT RECORD =====
    const now = new Date();
    const invoiceFileName = `IFL-${now.getFullYear()}${String(
      now.getMonth() + 1
    ).padStart(2, "0")}-${Math.floor(Math.random() * 100000)}.pdf`;
    const invoicePath = path.join(uploadsDir, invoiceFileName);

    const payment = new Payment({
      appointment_id,
      salon_id,
      branch_id,
      service_amount,
      product_amount,
      package_amount,
      membership_amount,
      sub_total,
      coupon_id: cleanCouponId,
      coupon_discount,
      additional_discount: safeNumber(additional_discount),
      additional_discount_type,
      final_additional_discount,
      membership_discount,
      additional_charges: safeNumber(additional_charges),
      tips: safeNumber(tips),
      tax_id: cleanTaxId,
      tax_amount,
      payment_method,
      payment_split: processed_split,
      final_total,
      total, // ✅ NEW FIELD
      invoice_file_name: invoiceFileName,
      invoice_format,
    });

    await payment.save();

    // ===== INVOICE DATA =====
    const invoiceData = {
      appointment_id,
      appointment,
      invoiceFileName,
      customer,
      now,
      payment_method,
      services,
      service_amount,
      product_amount,
      package_amount,
      membership_amount,
      coupon_discount,
      additional_discount_type,
      additional_discount,
      final_additional_discount,
      membership_discount,
      additional_charges,
      tax_amount,
      tax_details,
      tips,
      sub_total,
      final_total,
      total,
    };

    // ===== GENERATE INVOICE PDF =====
    let docOptions;
    if (invoice_format === "receipt") {
      docOptions = { size: [200, 800], margin: 10 };
    } else if (invoice_format === "halfpage") {
      docOptions = { size: "A4", margin: 50 };
    } else {
      docOptions = { margin: 50 }; // fullpage
    }

    const doc = new PDFDocument(docOptions);
    doc.pipe(fs.createWriteStream(invoicePath));

    if (invoice_format === "receipt") {
      await generateReceiptInvoice(doc, invoiceData);
    } else if (invoice_format === "halfpage") {
      await generateHalfPageInvoice(doc, invoiceData);
    } else if (invoice_format === "gst_invoice") {
      await generateGSTInvoice(doc, invoiceData);
    } else {
      await generateFullPageInvoice(doc, invoiceData);
    }

    doc.end();

    res.status(201).json({
      message: "Payment recorded successfully",
      payment,
      invoice_pdf_url: `/api/uploads/${invoiceFileName}`,
    });
  } catch (error) {
    console.error("Error processing payment:", error);
    res
      .status(500)
      .json({ message: "Error processing payment", error: error.message });
  }
});

// ✅ Get all payments by salon
router.get("/", async (req, res) => {
  const { salon_id } = req.query;
  if (!salon_id) return res.status(400).json({ message: "salon_id is required" });

  try {
    const payments = await Payment.find({ salon_id })
      .populate("salon_id", "name")
      .lean(); // ✅ lean so we can safely modify objects

    const data = await Promise.all(
      payments.map(async (p) => {
        let service_count = 0;
        let staff_tips = [];

        if (p.appointment_id) {
          const appointment = await Appointment.findById(p.appointment_id)
            .select("services")
            .populate("services.staff_id", "full_name email phone_number image")
            .lean();

          if (appointment?.services?.length) {
            service_count = appointment.services.length;

            const staffMap = {};
            for (const svc of appointment.services) {
              if (svc.staff_id?._id) {
                staffMap[svc.staff_id._id.toString()] = svc.staff_id;
              }
            }

            const staffList = Object.values(staffMap);
            const tipPerStaff = staffList.length > 0 ? (p.tips || 0) / staffList.length : 0;

            staff_tips = staffList.map((staff) => {
              const imgUrl = staff.image?.data
                ? `/api/staffs/image/${staff._id}.${staff.image.extension || "jpg"}`
                : null;

              return {
                _id: staff._id,
                name: staff.full_name,
                email: staff.email,
                phone: staff.phone_number,
                image_url: imgUrl, // ✅ Only send link
                tip: Number(tipPerStaff.toFixed(2)),
              };
            });
          }
        }

        const { additional_discount_value, ...rest } = p;

        return {
          ...rest,
          invoice_pdf_url: `/api/payments/invoice?invoice_id=${p.invoice_file_name}`,
          invoice_file_name: p.invoice_file_name?.replace(".pdf", ""),
          service_count,
          staff_tips,
        };
      })
    );

    res.status(200).json({ message: "Payments fetched successfully", data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error", error });
  }
});

// ✅ Get all payments by salon and branch
router.get("/by-branch", async (req, res) => {
  const { salon_id, branch_id } = req.query;

  if (!salon_id || !branch_id) {
    return res.status(400).json({ message: "salon_id and branch_id are required" });
  }

  try {
    const payments = await Payment.find({ salon_id, branch_id })
      .populate("salon_id", "name")
      .lean();

    const data = await Promise.all(
      payments.map(async (p) => {
        let service_count = 0;
        let staff_tips = [];

        if (p.appointment_id) {
          const appointment = await Appointment.findById(p.appointment_id)
            .select("services")
            .populate("services.staff_id", "full_name email phone_number image")
            .lean();

          if (appointment?.services?.length) {
            service_count = appointment.services.length;

            const staffMap = {};
            for (const svc of appointment.services) {
              if (svc.staff_id?._id) {
                staffMap[svc.staff_id._id.toString()] = svc.staff_id;
              }
            }

            const staffList = Object.values(staffMap);
            const tipPerStaff = staffList.length > 0 ? (p.tips || 0) / staffList.length : 0;

            staff_tips = staffList.map((staff) => {
              const imgUrl = staff.image?.data
                ? `/api/staffs/image/${staff._id}.${staff.image.extension || "jpg"}`
                : null;

              return {
                _id: staff._id,
                name: staff.full_name,
                email: staff.email,
                phone: staff.phone_number,
                image_url: imgUrl, // ✅ Only send link
                tip: Number(tipPerStaff.toFixed(2)),
              };
            });
          }
        }

        const { additional_discount_value, ...rest } = p;

        return {
          ...rest,
          invoice_pdf_url: `/api/payments/invoice?invoice_id=${p.invoice_file_name}`,
          invoice_file_name: p.invoice_file_name?.replace(".pdf", ""),
          service_count,
          staff_tips,
        };
      })
    );

    res.status(200).json({ message: "Branch-wise payments fetched successfully", data });
  } catch (error) {
    console.error("Error fetching branch payments:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ View specific invoice PDF by invoice_id (partial or full)
router.get("/invoice", async (req, res) => {
  try {
    const { invoice_id } = req.query;

    if (!invoice_id) {
      return res.status(400).json({ message: "invoice_id is required" });
    }

    const uploadsDir = path.join(__dirname, "../uploads");

    // Ensure .pdf is present
    const normalizedId = invoice_id.endsWith(".pdf") ? invoice_id : `${invoice_id}.pdf`;

    // ✅ Try exact match first
    const exactPath = path.join(uploadsDir, normalizedId);
    if (fs.existsSync(exactPath)) {
      return res.sendFile(exactPath, (err) => {
        if (err) {
          console.error("Error sending invoice file:", err);
          res.status(500).json({ message: "Error sending invoice file" });
        }
      });
    }

    // ✅ Try partial match as fallback
    const matchingFile = fs
      .readdirSync(uploadsDir)
      .find((file) => file.startsWith("IFL-") && file.endsWith(".pdf") && file.includes(invoice_id));

    if (!matchingFile) {
      return res.status(404).json({ message: "Invoice file not found" });
    }

    const fallbackPath = path.join(uploadsDir, matchingFile);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${matchingFile}"`);
    res.sendFile(fallbackPath, (err) => {
      if (err) {
        console.error("Error sending invoice file:", err);
        res.status(500).json({ message: "Error sending invoice file" });
      }
    });
  } catch (error) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const payment = await Payment.findByIdAndDelete(id);
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }
    res.status(200).json({ message: "Payment deleted successfully", payment });
  } catch (error) {
    console.error("Error deleting payment:", error);
    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
});

module.exports = router;