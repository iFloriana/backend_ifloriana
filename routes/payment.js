// payment.js
const orderHelpers = require("./order");
const generateInvoicePDF = orderHelpers.generateOrderInvoicePDF;
const express = require("express");
const router = express.Router();
const Appointment = require("../models/Appointment");
const Payment = require("../models/Payment");
const Coupon = require("../models/Coupon");
const Tax = require("../models/Tax");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const path = require("path");
const BranchMembership = require("../models/branchMembership");
const Customer = require("../models/Customer");
const CustomerMembership = require("../models/CustomerMembership");

const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ✅ Process Payment for an Existing Appointment
router.post("/", async (req, res) => {
  try {
    const {
      appointment_id,
      coupon_id,
      tax_id,
      additional_discount = 0,
      additional_discount_type = "fixed",
      tips = 0,
      payment_method,
      additional_charges = 0
    } = req.body;

    const appointment = await Appointment.findById(appointment_id);
    if (!appointment) return res.status(404).json({ message: "Appointment not found" });

    const customer = await Customer.findById(appointment.customer_id);
    if (!customer) return res.status(404).json({ message: "Customer not found" });

    const salon = await require("../models/Salon").findById(appointment.salon_id);
    const branch = await require("../models/Branch").findById(appointment.branch_id);
    const Service = require("../models/Service");

    let serviceDetails = [];
    if (appointment.services?.length > 0) {
      const serviceIds = appointment.services.map(svc => svc.service_id);
      serviceDetails = await Service.find({ _id: { $in: serviceIds } });
    }

    const Product = require("../models/Product");
    const Variation = require("../models/Variation");

    const productIds = appointment.products.map(p => p.product_id);
    const variationIds = appointment.products.map(p => p.variation_id).filter(Boolean);

    const productDetails = await Product.find({ _id: { $in: productIds } });
    const variationDetails = await Variation.find({ _id: { $in: variationIds } });

    const service_amount = appointment.services.reduce((sum, s) => sum + (s.service_amount || 0), 0);
    const product_amount = appointment.products.reduce((sum, p) => sum + (p.total_price || 0), 0);
    const additional_charges_num = Number(additional_charges) || 0;
    const tips_num = Number(tips) || 0;

    let base_total = service_amount + product_amount + additional_charges_num;

    // ✅ Membership Discount
    let membershipDiscountAmount = 0;
    let membership = null;

    const customerMembership = await CustomerMembership.findOne({
      customer_id: appointment.customer_id,
      salon_id: appointment.salon_id,
      end_date: { $gte: new Date() }
    });

    if (customerMembership?.branch_membership) {
      membership = await BranchMembership.findById(customerMembership.branch_membership);

      if (membership?.discount > 0 && membership.discount_type) {
        const discountValue = Number(membership.discount);
        membershipDiscountAmount = membership.discount_type === "percentage"
          ? (base_total * discountValue) / 100
          : discountValue;
      }
    }

    membershipDiscountAmount = parseFloat(membershipDiscountAmount.toFixed(2));

    // 🔻 Apply membership discount
    base_total -= membershipDiscountAmount;

    // ✅ Coupon Discount
    let couponDiscountAmount = 0;
    if (coupon_id) {
      const coupon = await Coupon.findById(coupon_id);
      if (coupon) {
        couponDiscountAmount = coupon.discount_type === "percent"
          ? (base_total * (Number(coupon.discount_amount) || 0)) / 100
          : (Number(coupon.discount_amount) || 0);
      }
    }
    couponDiscountAmount = parseFloat(couponDiscountAmount.toFixed(2));
    base_total -= couponDiscountAmount;

    // ✅ Additional Discount
    let additionalDiscountAmount = 0;
    if (additional_discount_type === "percentage") {
      additionalDiscountAmount = (base_total * Number(additional_discount)) / 100;
    } else {
      additionalDiscountAmount = Number(additional_discount);
    }
    additionalDiscountAmount = parseFloat(additionalDiscountAmount.toFixed(2));
    base_total -= additionalDiscountAmount;

    const sub_total = parseFloat(base_total.toFixed(2));

    // ✅ Tax
    let taxAmount = 0;
    if (tax_id) {
      const tax = await Tax.findById(tax_id);
      if (tax) {
        taxAmount = tax.type === "percent"
          ? (sub_total * (Number(tax.value) || 0)) / 100
          : (Number(tax.value) || 0);
      }
    }
    taxAmount = parseFloat(taxAmount.toFixed(2));

    // ✅ Final total
    const grand_total = sub_total + taxAmount + tips_num;


    // ✅ Save Payment
    const paymentData = {
      salon_id: appointment.salon_id,
      branch_id: appointment.branch_id,
      appointment_id: appointment._id,
      service_amount,
      product_amount,
      additional_charges: additional_charges_num,
      tips: tips_num,
      payment_method,
      branch_membership_discount: parseFloat(membershipDiscountAmount.toFixed(2)),
      coupon_id: coupon_id || null,
      coupon_discount: parseFloat(couponDiscountAmount.toFixed(2)),
      additional_discount: parseFloat(additionalDiscountAmount.toFixed(2)),
      additional_discount_type,
      sub_total,
      tax_id: tax_id || null,
      tax_amount: parseFloat(taxAmount.toFixed(2)),
      final_total: parseFloat(grand_total.toFixed(2))
    };

    const payment = await Payment.create(paymentData);

    await Appointment.findByIdAndUpdate(appointment_id, {
      payment_status: "Paid",
      grand_total: paymentData.final_total
    });

    // ✅ PDF invoice generation with original format
    const fs = require("fs");
    const PDFDocument = require("pdfkit");
    const path = require("path");
    const uploadsDir = path.join(__dirname, "../uploads");
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    const pdfFileName = `invoice-${payment._id}.pdf`;
    const invoicePath = path.join(uploadsDir, pdfFileName);
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(invoicePath));

    // Header
    doc.fontSize(22).text(salon?.name || "Your Salon Name", { align: "center" });
    doc.fontSize(14).text(branch?.name || "", { align: "center" });
    doc.fontSize(12).text(branch?.address || "", { align: "center" });
    doc.text(`Phone: ${branch?.contact_number || salon?.contact_number || "-"}`, { align: "center" });
    doc.text(`Email: ${branch?.contact_email || salon?.contact_email || "-"}`, { align: "center" });
    doc.moveDown();

    doc.fontSize(16).text("Invoice", { align: "center", underline: true });
    doc.moveDown();

    doc.fontSize(11);
    doc.text(`Invoice ID: ${payment._id}`);
    doc.text(`Appointment ID: ${appointment._id}`);
    doc.text(`Customer: ${customer.full_name}`);
    doc.text(`Phone: ${customer.phone_number || "-"}`);
    doc.text(`Date: ${new Date().toLocaleString()}`);
    doc.text(`Payment Method: ${payment_method}`);
    doc.moveDown();

    // Services
    doc.fontSize(13).text("Services", { underline: true });
    if (appointment.services.length > 0 && serviceDetails.length > 0) {
      appointment.services.forEach(svc => {
        const serviceObj = serviceDetails.find(s => s._id.toString() === svc.service_id.toString());
        const name = serviceObj?.name || "-";
        doc.fontSize(11).text(`Service: ${name}`);
      });
    } else {
      doc.fontSize(11).text("No services.");
    }
    doc.moveDown();

    // Products
    doc.fontSize(13).text("Products", { underline: true });
    if (appointment.products.length > 0) {
      appointment.products.forEach(prod => {
        const prodObj = productDetails.find(p => p._id.toString() === prod.product_id.toString());
        const varObj = variationDetails.find(v => v._id?.toString() === prod.variation_id?.toString());
        const prodName = prodObj?.product_name || "-";
        const varName = varObj ? ` (${varObj.name})` : "";
        doc.fontSize(11).text(`Product: ${prodName}${varName} x${prod.quantity}`);
      });
    } else {
      doc.fontSize(11).text("No products.");
    }
    doc.moveDown();

    // Charges Summary
    doc.fontSize(13).text("Charges Summary", { underline: true });
    doc.fontSize(11)
      .text(`Service Amount`, { continued: true }).text(` ₹${service_amount.toFixed(2)}`, { align: "right" })
      .text(`Product Amount`, { continued: true }).text(` ₹${product_amount.toFixed(2)}`, { align: "right" })
      .text(`Additional Charges`, { continued: true }).text(` ₹${additional_charges_num.toFixed(2)}`, { align: "right" })
      .text(`Membership Discount`, { continued: true }).text(` -₹${membershipDiscountAmount.toFixed(2)}`, { align: "right" })
      .text(`Coupon Discount`, { continued: true }).text(` -₹${couponDiscountAmount.toFixed(2)}`, { align: "right" })
      .text(`Additional Discount`, { continued: true }).text(` -₹${additionalDiscountAmount.toFixed(2)}`, { align: "right" })
      .text(`Tax`, { continued: true }).text(` ₹${taxAmount.toFixed(2)}`, { align: "right" })
      .text(`Tips`, { continued: true }).text(` ₹${tips_num.toFixed(2)}`, { align: "right" });

    doc.moveDown();
    doc.fontSize(12).text(`Subtotal: ₹${sub_total.toFixed(2)}`, { align: "right" });
    doc.fontSize(13).text(`Total Payable: ₹${grand_total.toFixed(2)}`, { align: "right" });
    doc.moveDown(2);

    doc.fontSize(9).text("Thank you for choosing us!", { align: "center" });
    doc.text("This is a system-generated invoice.", { align: "center" });
    doc.end();

    const invoice_pdf_url = `/api/uploads/${pdfFileName}`;

    res.status(200).json({
      message: "Payment recorded successfully",
      payment,
      invoice_pdf_url: `/api/uploads/invoice-${payment._id}.pdf`
    });

  } catch (error) {
    console.error("Error in payment processing:", error);
    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
});


// ✅ Get all payments by salon
router.get("/", async (req, res) => {
  const { salon_id } = req.query;
  if (!salon_id) return res.status(400).json({ message: "salon_id is required" });

  try {
    const payments = await Payment.find({ salon_id }).populate("salon_id", "name");

    // For each payment, fetch the appointment, count its services, and calculate staff tips
    const data = await Promise.all(payments.map(async (p) => {
      let service_count = 0;
      let staff_tips = [];

      if (p.appointment_id) {
        const appointment = await Appointment.findById(p.appointment_id)
          .select("services")
          .populate("services.staff_id", "full_name email phone_number image");

        if (appointment && Array.isArray(appointment.services)) {
          service_count = appointment.services.length;

          // Get unique staff
          const staffMap = {};
          for (const svc of appointment.services) {
            if (svc.staff_id && svc.staff_id._id) {
              staffMap[svc.staff_id._id.toString()] = svc.staff_id;
            }
          }

          const staffList = Object.values(staffMap);
          const tipPerStaff = staffList.length > 0 ? (p.tips || 0) / staffList.length : 0;

          staff_tips = staffList.map(staff => ({
            _id: staff._id,
            name: staff.full_name,
            email: staff.email,
            phone: staff.phone_number,
            image: staff.image,
            tip: Number(tipPerStaff.toFixed(2))
          }));
        }
      }

      const {
        additional_discount, // ✅ include this
        // 👇 destructure and discard this if present
        additional_discount_value,
        ...rest
      } = p.toObject();

      return {
        ...rest,
        additional_discount, // ✅ explicitly add it back
        invoice_pdf_url: `/api/uploads/invoice-${p._id}.pdf`,
        service_count,
        staff_tips
      };
    }));

    res.status(200).json({ message: "Payments fetched successfully", data });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// ✅ View specific invoice PDF
router.get("/invoice", async (req, res) => {
  try {
    const { invoice_id } = req.query;
    if (!invoice_id) return res.status(400).json({ message: "invoice_id is required" });

    const fileName = `invoice-${invoice_id}.pdf`;
    const filePath = path.join("uploads", fileName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Invoice file not found" });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
    res.sendFile(filePath, { root: "./" }, (err) => {
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

module.exports = router;