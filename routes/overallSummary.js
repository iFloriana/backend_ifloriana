const express = require("express");
const router = express.Router();
const Appointment = require("../models/Appointment");
const Order = require("../models/Order");
const Payment = require("../models/Payment");
const Staff = require("../models/Staff");
const CustomerMembership = require("../models/CustomerMembership");
const CustomerPackage = require("../models/CustomerPackage");
const Customer = require("../models/Customer");
const BranchMembership = require("../models/BranchMembership");
const BranchPackage = require("../models/BranchPackage");

router.get("/", async (req, res) => {
    try {
        const { salon_id, start_date, end_date } = req.query;
        if (!salon_id) {
            return res.status(400).json({ message: "salon_id is required" });
        }

        // ===== Date Range =====
        let startDate, endDate;
        if (start_date && end_date) {
            startDate = new Date(new Date(start_date).setHours(0, 0, 0, 0));
            endDate = new Date(new Date(end_date).setHours(23, 59, 59, 999));
        } else if (start_date && !end_date) {
            const d = new Date(start_date);
            startDate = new Date(d.setHours(0, 0, 0, 0));
            endDate = new Date(d.setHours(23, 59, 59, 999));
        } else {
            const t = new Date();
            startDate = new Date(t.setHours(0, 0, 0, 0));
            endDate = new Date(t.setHours(23, 59, 59, 999));
        }

        // Totals
        let staffMap = {};
        let totalServiceSales = 0;
        let totalProductSales = 0;
        let totalMembershipSales = 0;
        let totalPackageSales = 0;
        let cash = 0, card = 0, upi = 0;

        // ===== 1. Appointments =====
        const relevantAppointments = await Appointment.find({
            salon_id,
            appointment_date: { $gte: startDate, $lte: endDate },
            $or: [
                { payment_status: { $regex: /^paid$/i } },
                { status: { $regex: /^check-?out$/i } }
            ]
        })
            .populate("services.service_id", "name")
            .populate("services.staff_id", "full_name email")
            .lean();

        for (const appt of relevantAppointments) {
            // 🔎 Fetch related payment for adjusted totals
            const payment = await Payment.findOne({ appointment_id: appt._id }).lean();

            for (const svc of appt.services || []) {
                if (!svc.service_id?.name) continue;
                const excluded = ["package service", "package", "membership", "gift card"];
                if (excluded.some(ex => svc.service_id.name.toLowerCase().includes(ex))) continue;

                let adjustedServiceAmount = 0;
                if (payment) {
                    // match payment logic
                    adjustedServiceAmount =
                        (payment.service_amount || 0)
                        - (payment.membership_discount || 0)
                        - (payment.final_additional_discount || 0)
                        + (payment.additional_charges || 0);
                } else {
                    adjustedServiceAmount = svc.service_amount || 0;
                }

                totalServiceSales += adjustedServiceAmount;

                if (svc.staff_id) {
                    const staffId = svc.staff_id._id.toString();
                    if (!staffMap[staffId]) {
                        staffMap[staffId] = {
                            staff_id: staffId,
                            staff_name: svc.staff_id.full_name,
                            service_count: 0,
                            total_service_amount: 0,
                            total_product_amount: 0
                        };
                    }
                    staffMap[staffId].service_count += 1;
                    staffMap[staffId].total_service_amount += adjustedServiceAmount;
                }
            }

            for (const prod of appt.products || []) {
                const amount = prod.total_price || 0;
                totalProductSales += amount;

                if (prod.staff_id) {
                    const staffId = prod.staff_id.toString();
                    const staffDoc = await Staff.findById(staffId).lean();
                    if (staffDoc) {
                        if (!staffMap[staffId]) {
                            staffMap[staffId] = {
                                staff_id: staffId,
                                staff_name: staffDoc.full_name,
                                service_count: 0,
                                total_service_amount: 0,
                                total_product_amount: 0
                            };
                        }
                        staffMap[staffId].total_product_amount += amount;
                    }
                }
            }
        }

        // ===== 2. Orders =====
        const orders = await Order.find({
            salon_id,
            createdAt: { $gte: startDate, $lte: endDate }
        }).lean();

        orders.forEach(order => {
            totalProductSales += order.total_price || 0;
            const method = order.payment_method?.toLowerCase();
            if (method === "cash") cash += order.total_price || 0;
            else if (method === "card") card += order.total_price || 0;
            else if (method === "upi") upi += order.total_price || 0;
        });

        // ===== 3. Membership sales =====
        const memberships = await CustomerMembership.find({
            salon_id,
            createdAt: { $gte: startDate, $lte: endDate }
        }).lean();

        memberships.forEach(m => {
            if (m.membership_amount) totalMembershipSales += m.membership_amount || 0;
        });

        // ===== 3b. Membership + Package sales from Customer =====
        const customers = await Customer.find({
            salon_id,
            createdAt: { $gte: startDate, $lte: endDate }
        }).lean();

        for (const cust of customers) {
            if (cust.branch_membership && cust.branch_membership_valid_till) {
                const membership = await BranchMembership.findById(cust.branch_membership).lean();
                if (membership) {
                    const memAmount = membership.membership_amount || 0;
                    totalMembershipSales += memAmount;
                    const method = cust.payment_method?.toLowerCase();
                    if (method === "cash") cash += memAmount;
                    else if (method === "card") card += memAmount;
                    else if (method === "upi") upi += memAmount;
                }
            }

            if (cust.branch_package && cust.branch_package_valid_till) {
                for (const branchPkgId of cust.branch_package) {
                    const pkg = await CustomerPackage.findOne({
                        salon_id,
                        customer_id: cust._id,
                        branch_package_id: branchPkgId
                    }).lean();
                    if (!pkg) continue;

                    const branchPkg = await BranchPackage.findById(branchPkgId).lean();
                    const pkgPrice = Number(branchPkg?.package_price) || 0;

                    totalPackageSales += pkgPrice;
                    const method = cust.payment_method?.toLowerCase();
                    if (method === "cash") cash += pkgPrice;
                    else if (method === "card") card += pkgPrice;
                    else if (method === "upi") upi += pkgPrice;
                }
            }
        }

        // ===== 4. Payments =====
        const payments = await Payment.find({
            salon_id,
            createdAt: { $gte: startDate, $lte: endDate }
        }).lean();

        payments.forEach(p => {
            // ✅ add package & membership sales
            totalPackageSales += p.package_amount || 0;
            totalMembershipSales += p.membership_amount || 0;

            if (p.payment_method?.toLowerCase() === "split") {
                (p.payment_split || []).forEach(split => {
                    if (split.method?.toLowerCase() === "cash") cash += split.amount || 0;
                    else if (split.method?.toLowerCase() === "card") card += split.amount || 0;
                    else if (split.method?.toLowerCase() === "upi") upi += split.amount || 0;
                });
            } else {
                const method = p.payment_method?.toLowerCase();
                if (method === "cash") cash += p.final_total || 0;
                else if (method === "card") card += p.final_total || 0;
                else if (method === "upi") upi += p.final_total || 0;
            }
        });

        // ===== 5. Appointment counts =====
        const allAppointments = await Appointment.find({
            salon_id,
            appointment_date: { $gte: startDate, $lte: endDate }
        }).lean();
        let openAppointments = 0, completedAppointments = 0, cancelledAppointments = 0;
        allAppointments.forEach(appt => {
            if (
                appt.payment_status?.toLowerCase() === "paid" ||
                (appt.status && appt.status.toLowerCase() === "check-out")
            ) {
                completedAppointments++;
            } else if (appt.status?.toLowerCase() === "cancelled") {
                cancelledAppointments++;
            } else {
                openAppointments++;
            }
        });

        // ===== 7. Totals =====
        const sales_total = totalServiceSales + totalProductSales + totalMembershipSales + totalPackageSales;
        const collected_total = cash + card + upi;

        const summary = {
            total_service_sales: totalServiceSales,
            total_product_sales: totalProductSales,
            total_membership_sales: totalMembershipSales,
            total_package_sales: totalPackageSales,
            grand_total: sales_total,
            collected_total,
            difference: sales_total - collected_total,
            payment_breakdown: { cash, card, upi },
            appointment_counts: {
                open: openAppointments,
                completed: completedAppointments,
                cancelled: cancelledAppointments,
                total: openAppointments + completedAppointments + cancelledAppointments
            }
        };

        // ===== 8. Staff totals =====
        Object.values(staffMap).forEach(staff => {
            staff.total = (staff.total_service_amount || 0) + (staff.total_product_amount || 0);
        });

        const totalRow = {
            staff_name: "Total",
            service_count: Object.values(staffMap).reduce((s, x) => s + (x.service_count || 0), 0),
            total_service_amount: Object.values(staffMap).reduce((s, x) => s + (x.total_service_amount || 0), 0),
            total_product_amount: Object.values(staffMap).reduce((s, x) => s + (x.total_product_amount || 0), 0),
        };
        totalRow.total = totalRow.total_service_amount + totalRow.total_product_amount;

        const staffList = [...Object.values(staffMap), totalRow];

        res.status(200).json({
            success: true,
            summary,
            staff: staffList
        });

    } catch (err) {
        console.error("❌ Error in overall-summary:", err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

module.exports = router;