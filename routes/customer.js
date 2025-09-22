const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const path = require("path");
const Customer = require("../models/Customer");
const BranchPackage = require("../models/BranchPackage");
const BranchMembership = require("../models/BranchMembership");
const CustomerPackage = require("../models/CustomerPackage");
const CustomerMembership = require("../models/CustomerMembership");
const getUploader = require("../middleware/imageUpload");
const upload = getUploader();
const Appointment = require("../models/Appointment");

const router = express.Router();

// ------------------- Serve Customer Image -------------------
router.get("/image/:filename", async (req, res) => {
    try {
        const id = req.params.filename.split(".")[0];

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid customer ID" });
        }

        const customer = await Customer.findById(id);
        if (!customer?.image?.data) {
            return res.status(404).json({ message: "Image not found" });
        }

        res.set("Content-Type", customer.image.contentType || "image/jpeg");
        res.set("Content-Disposition", "inline");
        res.send(Buffer.from(customer.image.data));
    } catch (error) {
        console.error("Image fetch error:", error);
        res.status(500).json({ message: "Server error" });
    }
});

// Create Customer
router.post("/", upload.single("image"), async (req, res) => {
    try {
        const { salon_id, full_name, email, gender, phone_number, status,
            branch_package, branch_membership, payment_method, payment_split } = req.body;

        const image = req.file ? {
            data: req.file.buffer,
            contentType: req.file.mimetype,
            originalName: req.file.originalname,
            extension: path.extname(req.file.originalname).slice(1),
        } : undefined;

        let newCustomerData = {
            salon_id,
            full_name,
            gender,
            phone_number,
            status,
            image,
            package_and_membership: []
        };

        if (payment_method) newCustomerData.payment_method = payment_method;
        if (payment_split) {
            try {
                newCustomerData.payment_split =
                    typeof payment_split === "string" ? JSON.parse(payment_split) : payment_split;
            } catch {
                return res.status(400).json({ message: "Invalid payment_split format" });
            }
        }
        if (email && email.trim() !== "") newCustomerData.email = email.trim();

        // Add package/membership into unified array
        if (branch_package) {
            const pkg = await BranchPackage.findById(branch_package);
            if (!pkg) return res.status(400).json({ message: "Invalid BranchPackage ID" });

            newCustomerData.package_and_membership.push({
                branch_package,
                payment_method,
                date: new Date(),
            });
        }

        if (branch_membership) {
            const membership = await BranchMembership.findById(branch_membership);
            if (!membership) return res.status(400).json({ message: "Invalid BranchMembership ID" });

            newCustomerData.package_and_membership.push({
                branch_membership,
                payment_method,
                date: new Date(),
            });
        }

        const newCustomer = new Customer(newCustomerData);
        await newCustomer.save();

        res.status(201).json({ message: "Customer created successfully", data: newCustomer });
    } catch (error) {
        console.error("Error creating customer:", error);
        res.status(500).json({ message: "Server error", error });
    }
});

// Get customer names and IDs by salon_id
router.get("/names", async (req, res) => {
    const { salon_id } = req.query;
    if (!salon_id) {
        return res.status(400).json({ message: "salon_id is required" });
    }

    try {
        const customers = await Customer.find(
            { salon_id },
            { _id: 1, full_name: 1 }
        ).lean();

        res.status(200).json({
            message: "Customer names and IDs fetched successfully",
            data: customers,
        });
    } catch (error) {
        console.error("Error fetching customer names:", error);
        res.status(500).json({ message: "Internal server error" });
    }
});

// 🔹 Helper to format images
function formatImage(doc, type) {
    if (!doc) return doc;
    const obj = doc.toObject ? doc.toObject() : { ...doc };

    if (obj.image?.data) {
        const ext = obj.image.extension || "jpg";
        obj.image_url = `/api/${type}/image/${obj._id}.${ext}`;
    } else {
        obj.image_url = null;
    }

    delete obj.image; // ✅ remove raw buffer
    return obj;
}

// ✅ GET all customers (with populated package_and_membership)
router.get("/", async (req, res) => {
    const { salon_id } = req.query;
    if (!salon_id) return res.status(400).json({ message: "salon_id is required" });

    try {
        let customers = await Customer.find({ salon_id }, { image: 0 })
            .populate({ path: "salon_id", select: "-image" })
            .populate({
                path: "package_and_membership.branch_package",
                model: "BranchPackage",
            })
            .populate({
                path: "package_and_membership.branch_membership",
                model: "BranchMembership",
            })
            .lean();

        // Enhance each customer's package_and_membership
        customers = customers.map((c) => {
            c.package_and_membership = (c.package_and_membership || []).map((entry) => {
                let expiry_date = null;
                let status = "active";

                // --- Package expiry ---
                if (entry.branch_package && entry.branch_package.end_date) {
                    expiry_date = entry.branch_package.end_date;
                    status = new Date(expiry_date) < new Date() ? "expired" : "active";
                }

                // --- Membership expiry ---
                if (entry.branch_membership) {
                    if (entry.branch_membership.subscription_plan === "lifetime") {
                        expiry_date = null;
                        status = "active";
                    } else {
                        const monthsToAdd = parseInt(
                            entry.branch_membership.subscription_plan.split("-")[0]
                        );
                        const startDate = new Date(entry.date || entry.branch_membership.createdAt);
                        expiry_date = new Date(startDate.setMonth(startDate.getMonth() + monthsToAdd));
                        status = new Date(expiry_date) < new Date() ? "expired" : "active";
                    }
                }

                return {
                    ...entry,
                    expiry_date,
                    status,
                };
            });

            // Add image_url
            c.image_url = `/api/customers/image/${c._id}.jpg`;
            if (c.salon_id) {
                c.salon_id.image_url = `/api/salons/image/${c.salon_id._id}.jpg`;
            }

            return c;
        });

        res.json({ message: "Customers fetched successfully", data: customers });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

// GET /visit-history/:id
router.get("/visit-history/:id", async (req, res) => {
    try {
        const { id: customer_id } = req.params;
        const { salon_id } = req.query;

        if (!salon_id) {
            return res.status(400).json({ message: "salon_id is required" });
        }

        const mongoose = require("mongoose");
        if (!mongoose.Types.ObjectId.isValid(customer_id)) {
            return res.status(400).json({ message: "Invalid customer_id" });
        }

        const appointments = await Appointment.find({ salon_id, customer_id })
            .populate("services.service_id", "name")
            .populate("branch_id", "name")
            .lean();

        const history = appointments.map((apt) => ({
            visit_date: apt.appointment_date
                ? new Date(apt.appointment_date).toISOString().split("T")[0] // YYYY-MM-DD
                : null,
            services: (apt.services || []).map((s) => s.service_id?.name || "N/A"),
            branch_name: apt.branch_id?.name || "N/A",
            status: apt.status, // ["upcoming", "cancelled", "check-in", "check-out"]
        }));

        res.status(200).json({ success: true, data: history });
    } catch (error) {
        console.error("Error fetching visit history:", error);
        res.status(500).json({ message: "Internal Server Error", error: error.message });
    }
});

// ✅ GET single customer with populated package_and_membership
router.get("/:id", async (req, res) => {
    const { id } = req.params;
    const { salon_id } = req.query;

    if (!salon_id) {
        return res.status(400).json({ message: "salon_id is required" });
    }

    try {
        let customer = await Customer.findOne({ _id: id, salon_id }, { image: 0 }) 
            .populate({ path: "salon_id", select: "-image" })
            .populate({
                path: "package_and_membership.branch_package",
                model: "BranchPackage",
            })
            .populate({
                path: "package_and_membership.branch_membership",
                model: "BranchMembership",
            })
            .lean();

        if (!customer) return res.status(404).json({ message: "Customer not found" });

        // Enhance package_and_membership entries
        customer.package_and_membership = (customer.package_and_membership || []).map((entry) => {
            let expiry_date = null;
            let status = "active";

            // --- Package expiry ---
            if (entry.branch_package && entry.branch_package.end_date) {
                expiry_date = entry.branch_package.end_date;
                status = new Date(expiry_date) < new Date() ? "expired" : "active";
            }

            // --- Membership expiry ---
            if (entry.branch_membership) {
                if (entry.branch_membership.subscription_plan === "lifetime") {
                    expiry_date = null;
                    status = "active";
                } else {
                    const monthsToAdd = parseInt(
                        entry.branch_membership.subscription_plan.split("-")[0]
                    );
                    const startDate = new Date(entry.date || entry.branch_membership.createdAt);
                    expiry_date = new Date(startDate.setMonth(startDate.getMonth() + monthsToAdd));
                    status = new Date(expiry_date) < new Date() ? "expired" : "active";
                }
            }

            return {
                ...entry,
                expiry_date,
                status,
            };
        });

        // Add image URLs
        customer.image_url = `/api/customers/image/${customer._id}.jpg`;
        if (customer.salon_id) {
            customer.salon_id.image_url = `/api/salons/image/${customer.salon_id._id}.jpg`;
        }

        res.status(200).json({ message: "Customer fetched successfully", data: customer });
    } catch (error) {
        console.error("Error fetching customer:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

// ✅ Update customer (with package_and_membership history tracking)
router.get("/:id", async (req, res) => {
    const { id } = req.params;
    const { salon_id } = req.query;

    if (!salon_id) {
        return res.status(400).json({ message: "salon_id is required" });
    }

    try {
        let customer = await Customer.findOne({ _id: id, salon_id }, { image: 0 })
            .populate({ path: "salon_id", select: "-image" })
            .populate({
                path: "package_and_membership.branch_package",
                model: "BranchPackage",
            })
            .populate({
                path: "package_and_membership.branch_membership",
                model: "BranchMembership",
            })
            .lean();

        if (!customer) return res.status(404).json({ message: "Customer not found" });

        // Enhance package_and_membership with status + expiry_date
        customer.package_and_membership = customer.package_and_membership.map((entry) => {
            let expiry_date = null;
            let status = "active";

            if (entry.branch_package && entry.branch_package.end_date) {
                expiry_date = entry.branch_package.end_date;
                status = new Date(expiry_date) < new Date() ? "expired" : "active";
            }

            if (entry.branch_membership) {
                if (entry.branch_membership.subscription_plan === "lifetime") {
                    expiry_date = null;
                    status = "active";
                } else {
                    let monthsToAdd = parseInt(entry.branch_membership.subscription_plan.split("-")[0]);
                    const startDate = new Date(entry.date || entry.branch_membership.createdAt);
                    expiry_date = new Date(startDate.setMonth(startDate.getMonth() + monthsToAdd));
                    status = new Date(expiry_date) < new Date() ? "expired" : "active";
                }
            }

            return {
                ...entry,
                expiry_date,
                status,
            };
        });

        // Add image URL
        customer.image_url = `/api/customers/image/${customer._id}.jpg`;
        if (customer.salon_id) {
            customer.salon_id.image_url = `/api/salons/image/${customer.salon_id._id}.jpg`;
        }

        res.status(200).json({ message: "Customer fetched successfully", data: customer });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

// Patch: update only branch_package
router.patch("/:id", async (req, res) => {
    const { id } = req.params;
    const { salon_id, branch_package } = req.body;

    if (!salon_id || !branch_package) {
        return res.status(400).json({ message: "salon_id and branch_package are required" });
    }

    try {
        const customer = await Customer.findOne({ _id: id, salon_id });
        if (!customer) return res.status(404).json({ message: "Customer not found" });

        const pkg = await BranchPackage.findById(branch_package);
        if (!pkg) return res.status(400).json({ message: "Invalid BranchPackage ID" });

        customer.package_and_membership.push({
            branch_package,
            payment_method: req.body.payment_method,
            date: new Date(),
        });
        customer.branch_package_valid_till = pkg.end_date;
        customer.branch_package_bought_at = new Date();

        // Store CustomerPackage entry
        await CustomerPackage.create({
            customer_id: customer._id,
            salon_id,
            branch_package_id: branch_package,
            start_date: new Date(),
            end_date: pkg.end_date,
            package_details: pkg.package_details || [],
        });

        await customer.save();

        res.status(200).json({ message: "Branch package updated", data: customer });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error", error });
    }
});

// Patch: update only branch_membership
router.patch("/update-branch-membership/:id", async (req, res) => {
    const { id } = req.params;
    const { salon_id, branch_membership } = req.body;

    if (!salon_id || !branch_membership) {
        return res.status(400).json({ message: "salon_id and branch_membership are required" });
    }

    try {
        const customer = await Customer.findOne({ _id: id, salon_id });
        if (!customer) return res.status(404).json({ message: "Customer not found" });

        if (customer.branch_membership) {
            return res.status(400).json({ message: "Cannot update branch_membership as it already exists" });
        }

        const membership = await BranchMembership.findById(branch_membership);
        if (!membership) return res.status(400).json({ message: "Invalid BranchMembership ID" });

        const validTill = new Date();
        switch (membership.subscription_plan) {
            case "1-month":
                validTill.setMonth(validTill.getMonth() + 1);
                break;
            case "3-months":
                validTill.setMonth(validTill.getMonth() + 3);
                break;
            case "6-months":
                validTill.setMonth(validTill.getMonth() + 6);
                break;
            case "12-months":
                validTill.setMonth(validTill.getMonth() + 12);
                break;
            case "lifetime":
                validTill.setFullYear(validTill.getFullYear() + 70);
                break;
            default:
                return res.status(400).json({ message: "Invalid subscription plan" });
        }

        customer.package_and_membership.push({
            branch_membership,
            payment_method: req.body.payment_method,
            date: new Date(),
        });
        customer.branch_membership_valid_till = validTill;
        customer.branch_membership_bought_at = new Date();

        await customer.save();

        res.status(200).json({ message: "Branch membership updated", data: customer });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error", error });
    }
});

// Delete customer
router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    const { salon_id } = req.query;

    if (!salon_id) {
        return res.status(400).json({ message: "salon_id is required" });
    }

    try {
        const deletedCustomer = await Customer.findOneAndDelete({ _id: id, salon_id });
        if (!deletedCustomer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        // Delete all associated CustomerPackage records
        await CustomerPackage.deleteMany({ customer_id: id });

        res.status(200).json({ message: "Customer and associated packages deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

// Customer count
router.get("/count", async (req, res) => {
    const { salon_id } = req.query;

    if (!salon_id) {
        return res.status(400).json({ message: "salon_id is required" });
    }

    try {
        const totalCustomers = await Customer.countDocuments({ salon_id });
        res.status(200).json({ totalCustomers });
    } catch (error) {
        res.status(500).json({ message: "Error fetching customer count", error });
    }
});

module.exports = router;