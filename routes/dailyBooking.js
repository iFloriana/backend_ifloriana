const express = require("express");
const router = express.Router();
const Appointment = require("../models/Appointment");
const Payment = require("../models/Payment");

router.get("/", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const appointments = await Appointment.find({
      salon_id,
      status: "check-out"
    }).lean();

    const payments = await Payment.find({ salon_id }).lean();

    // Map payments by appointment ID
    const paymentMap = {};
    for (let pay of payments) {
      if (pay.appointment_id) {
        paymentMap[pay.appointment_id.toString()] = pay;
      }
    }

    const summaryMap = {};

    for (let appt of appointments) {
      let dateObj = appt.appointment_date ? new Date(appt.appointment_date) : new Date(appt.createdAt);
      if (isNaN(dateObj)) continue;

      const dateStr =
        dateObj.getUTCFullYear() +
        "-" +
        String(dateObj.getUTCMonth() + 1).padStart(2, "0") +
        "-" +
        String(dateObj.getUTCDate()).padStart(2, "0");

      if (!summaryMap[dateStr]) {
        summaryMap[dateStr] = {
          date: dateStr,
          appointmentsCount: 0,
          servicesCount: 0,
          usedPackageCount: 0,
          serviceAmount: 0,
          productAmount: 0,
          taxAmount: 0,
          tipsEarning: 0,
          additionalDiscount: 0,
          additionalCharges: 0,
          membershipDiscount: 0,
          finalAmount: 0,
          paymentBreakdown: { cash: 0, card: 0, upi: 0 }
        };
      }

      const payment = paymentMap[appt._id?.toString()];

      summaryMap[dateStr].appointmentsCount += 1;
      summaryMap[dateStr].servicesCount += appt.services?.length || 0;

      // Count used package services
      const usedPkgCount = appt.services?.filter(s => s.used_package)?.length || 0;
      summaryMap[dateStr].usedPackageCount += usedPkgCount;

      // Service amount calculation (minus membership discount)
      const rawServiceAmount = appt.services?.reduce((sum, s) => sum + (s.service_amount || 0), 0) || 0;
      const membershipDisc = payment?.membership_discount || 0;
      summaryMap[dateStr].serviceAmount += rawServiceAmount - membershipDisc;
      summaryMap[dateStr].membershipDiscount += membershipDisc;

      // Product amount from Payment
      summaryMap[dateStr].productAmount += payment?.product_amount || 0;

      // Other amounts
      summaryMap[dateStr].tipsEarning += payment?.tips || 0;
      summaryMap[dateStr].taxAmount += payment?.tax_amount || 0;
      summaryMap[dateStr].additionalDiscount += payment?.additional_discount || 0;
      summaryMap[dateStr].additionalCharges += payment?.additional_charges || 0;

      // Payment method breakdown
      if (payment?.payment_method) {
        const method = payment.payment_method.toLowerCase();
        if (method.includes("cash")) summaryMap[dateStr].paymentBreakdown.cash += payment.final_total || 0;
        if (method.includes("card")) summaryMap[dateStr].paymentBreakdown.card += payment.final_total || 0;
        if (method.includes("upi")) summaryMap[dateStr].paymentBreakdown.upi += payment.final_total || 0;
      }

      // Final amount calculation (subtract coupon discount too)
      summaryMap[dateStr].finalAmount =
        summaryMap[dateStr].serviceAmount +
        summaryMap[dateStr].productAmount +
        summaryMap[dateStr].taxAmount +
        summaryMap[dateStr].tipsEarning +
        summaryMap[dateStr].additionalCharges -
        summaryMap[dateStr].additionalDiscount -
        (payment?.coupon_discount || 0);
    }

    // Fill missing last 14 days
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      date.setUTCDate(date.getUTCDate() - i);
      const dateStr = date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0") + "-" + String(date.getUTCDate()).padStart(2, "0");

      if (!summaryMap[dateStr]) {
        summaryMap[dateStr] = {
          date: dateStr,
          appointmentsCount: 0,
          servicesCount: 0,
          usedPackageCount: 0,
          serviceAmount: 0,
          productAmount: 0,
          taxAmount: 0,
          tipsEarning: 0,
          additionalDiscount: 0,
          additionalCharges: 0,
          membershipDiscount: 0,
          finalAmount: 0,
          paymentBreakdown: { cash: 0, card: 0, upi: 0 }
        };
      }
    }

    const summary = Object.values(summaryMap).sort((a, b) => new Date(a.date) - new Date(b.date));

    res.status(200).json({
      message: "Daily booking summary fetched successfully",
      data: summary
    });
  } catch (error) {
    console.error("Error fetching summary:", error);
    res.status(500).json({ message: "Server error", error });
  }
});

module.exports = router;