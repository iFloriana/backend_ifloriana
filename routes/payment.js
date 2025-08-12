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

const uploadsDir = path.join(__dirname, "../uploads");

function normalizeId(id) {
  if (!id) return null;
  return typeof id === "object" && id._id ? id._id.toString() : id.toString();
}

function formatCurrency(value) {
  return `₹${value.toFixed(2)}`;
}

router.post("/", async (req, res) => {
  try {
    const {
      appointment_id,
      payment_method,
      coupon_id,
      tax_id,
      additional_discount = 0,
      additional_discount_type = "flat",
      additional_charges = 0,
      tips = 0
    } = req.body;

    const cleanCouponId = coupon_id || undefined;
    const cleanTaxId = tax_id || undefined;

    const appointment = await Appointment.findById(appointment_id)
      .populate("customer_id")
      .populate("salon_id")
      .populate("branch_id")
      .populate("services.service_id");

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    const salon_id = appointment.salon_id?._id || appointment.salon_id;
    const branch_id = appointment.branch_id?._id || appointment.branch_id;
    const customer_id = appointment.customer_id?._id || appointment.customer_id;
    const services = appointment.services || [];

    const customerPackages = await CustomerPackage.find({
      customer_id,
      salon_id,
      "package_details.quantity": { $gt: 0 }
    });

    const servicePackageMap = {};
    for (const pkg of customerPackages) {
      for (const detail of pkg.package_details) {
        const sid = detail.service_id?.toString();
        if (detail.quantity > 0) {
          if (!servicePackageMap[sid]) servicePackageMap[sid] = [];
          servicePackageMap[sid].push({ pkg, detail });
        }
      }
    }

    for (const s of services) {
      const sid = s.service_id?._id?.toString() || s.service_id?.toString();
      const matchingPackages = servicePackageMap[sid];

      s.used_package = false;
      s.package_id = null;

      if (matchingPackages?.length) {
        for (const entry of matchingPackages) {
          const { pkg, detail } = entry;
          if (detail.quantity > 0) {
            detail.quantity -= 1;
            s.service_amount = 0;
            s.used_package = true;
            s.package_id = pkg._id;
            await pkg.save();
            break;
          }
        }
      }
    }

    await Appointment.findByIdAndUpdate(appointment_id, { services });

    const service_amount = services.reduce((sum, s) => sum + (s.service_amount || 0), 0);
    const product_amount = appointment.products?.reduce((sum, p) => sum + (p.total_price || 0), 0) || 0;

    // ✅ Membership Discount from Customer's branch_membership
    let membership_discount = 0;
    const customer = await Customer.findById(customer_id);
    const today = new Date();

    if (
      customer?.branch_membership &&
      customer?.branch_membership_valid_till &&
      new Date(customer.branch_membership_valid_till) >= today
    ) {
      const BranchMembership = require("../models/branchMembership");
      const branchMembership = await BranchMembership.findById(customer.branch_membership);
      if (branchMembership?.discount) {
        const membershipDiscountPercentage = branchMembership.discount;
        const baseForMembership = service_amount + additional_charges;
        membership_discount = Math.round((baseForMembership * membershipDiscountPercentage) / 100);
      }
    }

    const base_amount = service_amount + additional_charges;
    const after_membership = base_amount - membership_discount;

    const final_additional_discount = additional_discount_type === "percentage"
      ? Math.round((after_membership * additional_discount) / 100)
      : additional_discount;
    const after_additional_discount = after_membership - final_additional_discount;

    let coupon_discount = 0;
    if (cleanCouponId) {
      const coupon = await Coupon.findById(cleanCouponId);
      const now = new Date();
      if (
        coupon &&
        coupon.status === 1 &&
        now >= coupon.start_date &&
        now <= coupon.end_date
      ) {
        coupon_discount = coupon.discount_type === "percent"
          ? Math.round((after_additional_discount * coupon.discount_amount) / 100)
          : coupon.discount_amount;
      }
    }

    const after_coupon = after_additional_discount - coupon_discount;

    let tax_amount = 0;
    if (cleanTaxId) {
      const tax = await Tax.findById(cleanTaxId);
      if (tax?.status === 1) {
        tax_amount = tax.type === "percent"
          ? Math.round((after_coupon * tax.value) / 100)
          : tax.value;
      }
    }

    const sub_total = base_amount;
    const total = after_coupon + tax_amount;
    const final_total = total + tips + product_amount;

    const now = new Date();
    const invoiceFileName = `IFL-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${Math.floor(Math.random() * 100000)}.pdf`;
    const invoicePath = path.join(uploadsDir, invoiceFileName);

    const payment = new Payment({
      appointment_id,
      salon_id,
      branch_id,
      service_amount,
      product_amount,
      sub_total,
      coupon_id: cleanCouponId,
      coupon_discount,
      additional_discount: final_additional_discount,
      additional_discount_type,
      membership_discount,
      additional_charges,
      tips,
      tax_id: cleanTaxId,
      tax_amount,
      payment_method,
      final_total,
      invoice_file_name: invoiceFileName
    });

    await payment.save();

    // Update appointment payment status
    await Appointment.findByIdAndUpdate(appointment_id, { payment_status: "Paid" });

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(fs.createWriteStream(invoicePath));

    const branch = appointment.branch_id || {};
    const salon = appointment.salon_id || {};

    doc.fontSize(22).text(salon?.salon_name || "Your Salon Name", { align: "center", bold: true });
    doc.fontSize(14).text(branch?.name || "", { align: "center" });
    doc.fontSize(12).text(branch?.address || "", { align: "center" });
    doc.text(`Phone: ${branch?.contact_number || salon?.contact_number || "-"}`, { align: "center" });
    doc.text(`Email: ${branch?.contact_email || salon?.contact_email || "-"}`, { align: "center" });
    doc.moveDown();

    doc.fontSize(16).text("Payment Invoice", { align: "center", underline: true });
    doc.moveDown();

    doc.fontSize(11);
    doc.text(`Invoice ID: ${invoiceFileName.replace(".pdf", "")}`);
    doc.text(`Customer: ${customer.full_name}`);
    doc.text(`Phone: ${customer.phone_number || "-"}`);
    doc.text(`Date: ${now.toLocaleString()}`);
    doc.text(`Payment Method: ${payment_method}`);
    doc.moveDown();

    doc.fontSize(13).text("Services", { underline: true });
    if (services.length > 0) {
      services.forEach(svc => {
        const name = svc.service_id?.name || "-";
        const price = svc.used_package ? 0 : (svc.service_amount || 0);
        const label = svc.used_package ? "(from package)" : "";
        doc.fontSize(11).text(`Service: ${name} - ₹${price.toFixed(2)} ${label}`);
      });
    } else {
      doc.fontSize(11).text("No services.");
    }
    doc.moveDown();

    doc.fontSize(13).text("Products", { underline: true });
    if (appointment.products?.length > 0) {
      appointment.products.forEach(prod => {
        const name = prod.name || "-";
        const qty = prod.quantity || 1;
        const price = prod.total_price || 0;
        doc.fontSize(11).text(`Product: ${name} x${qty} - ₹${price.toFixed(2)}`);
      });
    } else {
      doc.fontSize(11).text("No products.");
    }
    doc.moveDown();

    doc.fontSize(13).text("Charges Summary", { underline: true });
    doc.fontSize(11)
      .text(`Service Amount: ₹${service_amount.toFixed(2)}`)
      .text(`Product Amount: ₹${product_amount.toFixed(2)}`)
      .text(`Coupon Discount: -₹${coupon_discount.toFixed(2)}`)
      .text(`Additional Discount: -₹${final_additional_discount.toFixed(2)}${additional_discount_type === "percentage" ? ` (${additional_discount}%)` : ""}`)
      .text(`Membership Discount: -₹${membership_discount.toFixed(2)}`) // ✅ Added here
      .text(`Additional Charges: ₹${additional_charges.toFixed(2)}`)
      .text(`Tax: ₹${tax_amount.toFixed(2)}`)
      .text(`Tips: ₹${tips.toFixed(2)}`);
    doc.moveDown();
    doc.fontSize(12).text(`Subtotal: ₹${sub_total.toFixed(2)}`, { align: "right" });
    doc.fontSize(13).text(`Total Payable: ₹${final_total.toFixed(2)}`, { align: "right" });
    doc.moveDown(2);

    doc.fontSize(9).text("Thank you for choosing us!", { align: "center" });
    doc.text("This is a system-generated invoice.", { align: "center" });
    doc.end();

    res.status(200).json({
      message: "Payment recorded successfully",
      payment,
      invoice_pdf_url: `/api/uploads/${invoiceFileName}`
    });

  } catch (error) {
    console.error("Error processing payment:", error);
    res.status(500).json({ message: "Error processing payment", error: error.message });
  }
});

// ✅ Get all payments by salon
router.get("/", async (req, res) => {
  const { salon_id } = req.query;
  if (!salon_id) return res.status(400).json({ message: "salon_id is required" });

  try {
    const payments = await Payment.find({ salon_id }).populate("salon_id", "name");

    const data = await Promise.all(
      payments.map(async (p) => {
        let service_count = 0;
        let staff_tips = [];

        if (p.appointment_id) {
          const appointment = await Appointment.findById(p.appointment_id)
            .select("services")
            .populate("services.staff_id", "full_name email phone_number image");

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

            staff_tips = staffList.map((staff) => ({
              _id: staff._id,
              name: staff.full_name,
              email: staff.email,
              phone: staff.phone_number,
              image: staff.image,
              tip: Number(tipPerStaff.toFixed(2)),
            }));
          }
        }

        const {
          additional_discount_value, // discard
          ...rest
        } = p.toObject();

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
    const payments = await Payment.find({ salon_id, branch_id }).populate("salon_id", "name");

    const data = await Promise.all(
      payments.map(async (p) => {
        let service_count = 0;
        let staff_tips = [];

        if (p.appointment_id) {
          const appointment = await Appointment.findById(p.appointment_id)
            .select("services")
            .populate("services.staff_id", "full_name email phone_number image");

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

            staff_tips = staffList.map((staff) => ({
              _id: staff._id,
              name: staff.full_name,
              email: staff.email,
              phone: staff.phone_number,
              image: staff.image,
              tip: Number(tipPerStaff.toFixed(2)),
            }));
          }
        }

        const {
          additional_discount_value,
          ...rest
        } = p.toObject();

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