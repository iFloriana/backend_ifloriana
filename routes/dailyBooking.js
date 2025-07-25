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

    // Map payment by appointment ID
    const paymentMap = {};
    for (let pay of payments) {
      if (pay.appointment_id) {
        paymentMap[pay.appointment_id.toString()] = pay;
      }
    }

    // Prepare summaries
    const dateSet = new Set();
    const summaryMap = {};

    for (let appt of appointments) {
      let dateObj = appt.appointment_date ? new Date(appt.appointment_date) : new Date(appt.createdAt);
      if (isNaN(dateObj)) continue;

      const dateStr = dateObj.getUTCFullYear() + "-" + String(dateObj.getUTCMonth() + 1).padStart(2, '0') + "-" + String(dateObj.getUTCDate()).padStart(2, '0');
      dateSet.add(dateStr);

      if (!summaryMap[dateStr]) {
        summaryMap[dateStr] = {
          date: dateStr,
          appointmentsCount: 0,
          servicesCount: 0,
          serviceAmount: 0,
          taxAmount: 0,
          tipsEarning: 0,
          additionalDiscount: 0,
          additionalCharges: 0,
          finalAmount: 0
        };
      }

      const payment = paymentMap[appt._id?.toString()];

      summaryMap[dateStr].appointmentsCount += 1;
      summaryMap[dateStr].servicesCount += appt.services?.length || 0;
      summaryMap[dateStr].serviceAmount += appt.services?.reduce((sum, s) => sum + (s.service_amount || 0), 0);
      summaryMap[dateStr].tipsEarning += payment?.tips || 0;
      summaryMap[dateStr].taxAmount += payment?.tax_amount || 0;
      summaryMap[dateStr].additionalDiscount += payment?.additional_discount || 0;

      // ⛔ Additional charges not found in schema. Update this if added in future.
      summaryMap[dateStr].additionalCharges += payment?.additional_charges || 0;

      summaryMap[dateStr].finalAmount =
        summaryMap[dateStr].serviceAmount +
        summaryMap[dateStr].taxAmount +
        summaryMap[dateStr].tipsEarning +
        summaryMap[dateStr].additionalCharges -
        summaryMap[dateStr].additionalDiscount;
    }

    // Fill in 14 days back
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const date = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      date.setUTCDate(date.getUTCDate() - i);
      const dateStr = date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, '0') + "-" + String(date.getUTCDate()).padStart(2, '0');

      if (!summaryMap[dateStr]) {
        summaryMap[dateStr] = {
          date: dateStr,
          appointmentsCount: 0,
          servicesCount: 0,
          serviceAmount: 0,
          taxAmount: 0,
          tipsEarning: 0,
          additionalDiscount: 0,
          additionalCharges: 0,
          finalAmount: 0
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