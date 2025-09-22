const express = require("express");
const router = express.Router();
const Appointment = require("../models/Appointment");
const Payment = require("../models/Payment");

router.get("/", async (req, res) => {
  const { salon_id } = req.query;
  if (!salon_id) return res.status(400).json({ message: "salon_id is required" });

  try {
    const appointments = await Appointment.find({ salon_id, status: "check-out" }).lean();
    const payments = await Payment.find({ salon_id }).lean();

    // map payments by appointment (allow multiple payments per appointment)
    const paymentMap = {};
    for (const pay of payments) {
      const key = pay.appointment_id?.toString();
      if (!key) continue;
      if (!paymentMap[key]) paymentMap[key] = [];
      paymentMap[key].push(pay);
    }

    const round2 = v => Math.round((Number(v) || 0) * 100) / 100;

    const summaryMap = {};

    for (const appt of appointments) {
      const dateObj = appt.appointment_date ? new Date(appt.appointment_date) : new Date(appt.createdAt);
      if (isNaN(dateObj)) continue;

      const dateStr =
        dateObj.getUTCFullYear() + "-" +
        String(dateObj.getUTCMonth() + 1).padStart(2, "0") + "-" +
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

      summaryMap[dateStr].appointmentsCount += 1;
      summaryMap[dateStr].servicesCount += appt.services?.length || 0;
      summaryMap[dateStr].usedPackageCount += appt.services?.filter(s => s.used_package)?.length || 0;

      // raw service amount (from appointment)
      const rawServiceAmount =
        (appt.services?.reduce((sum, s) => sum + (Number(s.service_amount) || 0), 0) || 0);
      summaryMap[dateStr].serviceAmount += round2(rawServiceAmount);

      // Gather all payments for this appointment (may be multiple)
      const paymentsForAppt = paymentMap[appt._id?.toString()] || [];

      // accumulators for this appointment (from payments)
      let paidSum = 0;
      let cashSum = 0;
      let cardSum = 0;
      let upiSum = 0;
      let tipsSum = 0;
      let productSum = 0;
      let membershipSum = 0;
      let couponSum = 0;
      let addChargesSum = 0;
      let addDiscountSum = 0;
      let taxSum = 0;

      if (paymentsForAppt.length > 0) {
        for (const payment of paymentsForAppt) {
          const method = payment.payment_method?.toLowerCase().trim();

          // If split, add each split's amount to breakdown
          if (method === "split" && Array.isArray(payment.payment_split)) {
            for (const split of payment.payment_split) {
              const splitMethod = (split.method || "").toLowerCase().trim();
              const amt = Number(split.amount) || 0;
              paidSum += amt;

              if (splitMethod.includes("cash")) cashSum += amt;
              else if (splitMethod.includes("card")) cardSum += amt;
              else if (splitMethod.includes("upi")) upiSum += amt;
              else cashSum += amt; // fallback to cash for unknown labels
            }
          } else {
            // For non-split payments use the explicit numeric paid field(s)
            // try common field names and fallback to final_total/total
            const paid = Number(
              payment.amount ??
              payment.paid_amount ??
              payment.paid ??
              payment.final_total ??
              payment.total
            ) || 0;

            paidSum += paid;

            if (method?.includes("cash")) cashSum += paid;
            else if (method?.includes("card")) cardSum += paid;
            else if (method?.includes("upi")) upiSum += paid;
            else cashSum += paid; // fallback
          }

          // Sum other optional fields if present in Payment doc
          tipsSum += Number(payment.tips) || 0;
          productSum += Number(payment.product_amount) || 0;
          membershipSum += Number(payment.membership_discount) || 0;
          couponSum += Number(payment.coupon_discount) || 0;

          // additional charges/discount/tax might be stored as flat numbers in payment docs:
          addChargesSum += Number(payment.additional_charges) || 0;
          addDiscountSum += Number(payment.additional_discount) || 0;
          // tax_amount *may* be stored as computed tax in some docs; sum what's present.
          taxSum += Number(payment.tax_amount) || 0;
        }

        // Add aggregated values to day summary (rounded)
        summaryMap[dateStr].productAmount += round2(productSum);
        summaryMap[dateStr].membershipDiscount += round2(membershipSum);
        summaryMap[dateStr].additionalCharges += round2(addChargesSum);
        summaryMap[dateStr].additionalDiscount += round2(addDiscountSum);
        summaryMap[dateStr].taxAmount += round2(taxSum);
        summaryMap[dateStr].tipsEarning += round2(tipsSum);

        // Final amount should match the sum of actual paid amounts for that appointment
        summaryMap[dateStr].finalAmount += round2(paidSum);

        // Payment breakdown
        summaryMap[dateStr].paymentBreakdown.cash += round2(cashSum);
        summaryMap[dateStr].paymentBreakdown.card += round2(cardSum);
        summaryMap[dateStr].paymentBreakdown.upi += round2(upiSum);
      } else {
        // No payment document found for this appointment
        // Fallback: try to compute final from appointment + (maybe) a single payment object (if exists)
        // Keep previous logic but avoid double-counting tips — keep it conservative.

        // If a single payment was expected but not found, we treat amounts as zero to avoid false positives:
        // compute base as service amount only (no product/membership/discount/tax/tips)
        const base = rawServiceAmount;
        const assumedTax = 0;
        const assumedTips = 0;

        summaryMap[dateStr].taxAmount += round2(assumedTax);
        summaryMap[dateStr].tipsEarning += round2(assumedTips);
        summaryMap[dateStr].finalAmount += round2(base + assumedTax + assumedTips);
      }
    }

    // ensure last 14 days exist
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      d.setUTCDate(d.getUTCDate() - i);
      const ds = d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");

      if (!summaryMap[ds]) {
        summaryMap[ds] = {
          date: ds,
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

    res.status(200).json({ message: "Daily booking summary fetched successfully", data: summary });
  } catch (err) {
    console.error("Error fetching summary:", err);
    res.status(500).json({ message: "Server error", error: err });
  }
});

module.exports = router;