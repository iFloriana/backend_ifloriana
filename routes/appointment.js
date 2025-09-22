const express = require("express");
const router = express.Router();
const Appointment = require("../models/Appointment");
const Service = require("../models/Service");
const Product = require("../models/Product");
const CustomerPackage = require("../models/CustomerPackage");
const mongoose = require("mongoose");
const BranchPackage = require("../models/BranchPackage");
const BranchMembership = require("../models/BranchMembership");

// Helper: Build proper image URL from Mongo image object
const getImageUrl = (image) => {
  if (!image || !image._id || !image.extension) return null;
  return `/image/${image._id}.${image.extension}`;
};

// post appointment
router.post("/", async (req, res) => {
  try {
    const {
      salon_id,
      customer_id,
      branch_id,
      appointment_date,
      appointment_time,
      services = [],
      products = [],
      notes,
      status,
      payment_status,
      branch_package,     // if package purchased this appointment
      branch_membership   // if membership purchased this appointment
    } = req.body;

    const mongoose = require("mongoose");
    const Customer = require("../models/Customer");
    const Service = require("../models/Service");
    const Product = require("../models/Product");
    const CustomerPackage = require("../models/CustomerPackage");
    const CustomerMembership = require("../models/CustomerMembership");

    // ---- Handle package purchase ----
    let package_id = null;
    let package_price = 0;
    if (branch_package) {
      const existingCustomer = await Customer.findById(customer_id);
      if (
        existingCustomer &&
        existingCustomer.branch_package &&
        String(existingCustomer.branch_package) === String(branch_package)
      ) {
        if (
          !existingCustomer.branch_package_valid_till ||
          new Date(existingCustomer.branch_package_valid_till) > new Date()
        ) {
          return res
            .status(400)
            .json({ message: "Customer already has this package and it is still valid." });
        }
      }
      const BranchPackage = require("../models/BranchPackage");
      const pkg = await BranchPackage.findById(branch_package);
      if (!pkg) return res.status(400).json({ message: "Invalid BranchPackage ID" });

      package_price = pkg.package_price || 0;

      const customerPackage = await CustomerPackage.create({
        customer_id,
        salon_id,
        branch_package_id: branch_package,
        branch_id,
        start_date: new Date(),
        end_date: pkg.end_date,
        package_details: pkg.package_details || [],
      });

      package_id = customerPackage._id;

      await Customer.findByIdAndUpdate(customer_id, {
        branch_package,
        branch_package_bought_at: new Date(),
        branch_package_valid_till: pkg.end_date,
      });
    }

    // ---- Handle membership purchase ----
    let membership_id = null;
    let membership_price = 0;
    if (branch_membership) {
      const existingCustomer = await Customer.findById(customer_id);
      if (
        existingCustomer &&
        existingCustomer.branch_membership &&
        String(existingCustomer.branch_membership) === String(branch_membership)
      ) {
        if (
          !existingCustomer.branch_membership_valid_till ||
          new Date(existingCustomer.branch_membership_valid_till) > new Date()
        ) {
          return res
            .status(400)
            .json({ message: "Customer already has this membership and it is still valid." });
        }
      }
      const BranchMembership = require("../models/BranchMembership");
      const membership = await BranchMembership.findById(branch_membership);
      if (!membership) return res.status(400).json({ message: "Invalid BranchMembership ID" });

      membership_price = membership.membership_amount || 0;
      const startDate = new Date();
      let endDate = null;

      switch (membership.subscription_plan) {
        case "1-month":
          endDate = new Date(startDate);
          endDate.setMonth(endDate.getMonth() + 1);
          break;
        case "3-months":
          endDate = new Date(startDate);
          endDate.setMonth(endDate.getMonth() + 3);
          break;
        case "6-months":
          endDate = new Date(startDate);
          endDate.setMonth(endDate.getMonth() + 6);
          break;
        case "12-months":
          endDate = new Date(startDate);
          endDate.setMonth(endDate.getMonth() + 12);
          break;
        case "lifetime":
          endDate = null;
          break;
        default:
          return res.status(400).json({ message: "Invalid subscription plan" });
      }

      const customerMembership = await CustomerMembership.create({
        customer_id,
        salon_id,
        branch_membership,
        start_date: startDate,
        end_date: endDate,
      });

      membership_id = customerMembership._id;

      await Customer.findByIdAndUpdate(customer_id, {
        branch_membership,
        branch_membership_bought_at: new Date(),
        branch_membership_valid_till: endDate,
      });
    }

    // ---- Services ----
    let total_payment = 0;
    const updatedServices = [];

    for (const svc of services) {
      const { service_id, staff_id } = svc;
      const srv = await Service.findById(service_id);
      if (!srv) {
        console.error("❌ Service not found:", service_id);
        return res.status(404).json({ message: "Service not found" });
      }

      let service_amount = srv.regular_price || 0;
      let used_package = false;
      let used_package_id = null;

      // Just check if package exists, DO NOT decrement here
      const pkgWithService = await CustomerPackage.findOne({
        customer_id: new mongoose.Types.ObjectId(customer_id),
        salon_id: new mongoose.Types.ObjectId(salon_id),
        $or: [{ end_date: null }, { end_date: { $gte: new Date() } }],
        "package_details.service_id": new mongoose.Types.ObjectId(service_id),
        "package_details.quantity": { $gt: 0 },
      });

      if (pkgWithService) {
        service_amount = 0;
        used_package = true;
        used_package_id = pkgWithService._id;
      } else {
        total_payment += service_amount;
      }

      updatedServices.push({
        service_id,
        staff_id,
        service_amount,
        service_duration: srv.service_duration,
        used_package,
        package_id: used_package_id,
      });
    }

    // ---- Products ----
    const updatedProducts = [];
    for (const prod of products) {
      const { product_id, variant_id, quantity, staff_id } = prod;
      const qty = parseInt(quantity);
      if (!qty || qty < 1) {
        return res.status(400).json({ message: "Invalid product quantity" });
      }

      const prodDoc = await Product.findById(product_id);
      if (!prodDoc) return res.status(404).json({ message: "Product not found" });

      let unit_price;
      if (variant_id) {
        const variant = prodDoc.variants.find((v) => v._id.toString() === variant_id);
        if (!variant || typeof variant.price !== "number") {
          return res.status(400).json({ message: "Variant or price unavailable" });
        }
        if (variant.stock < qty) {
          return res.status(400).json({ message: "Insufficient stock for variant" });
        }
        variant.stock -= qty;
        unit_price = variant.price;
      } else {
        unit_price = prodDoc.price || 0;
        if ((prodDoc.stock || 0) < qty) {
          return res.status(400).json({ message: "Insufficient stock for product" });
        }
        prodDoc.stock -= qty;
      }

      await prodDoc.save();

      const total_price = unit_price * qty;
      total_payment += total_price;

      updatedProducts.push({
        product_id,
        variant_id,
        quantity: qty,
        unit_price,
        total_price,
        staff_id: staff_id || null,
      });
    }

    // Add package & membership price
    total_payment += package_price;
    total_payment += membership_price;

    // ---- Create Appointment ----
    const appointmentData = {
      salon_id,
      customer_id,
      branch_id,
      appointment_date,
      appointment_time,
      services: updatedServices,
      products: updatedProducts,
      notes,
      status,
      payment_status,
      total_payment,
      order_code: `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`,
    };

    if (package_id) appointmentData.branch_package = package_id;
    if (membership_id) appointmentData.branch_membership = membership_id;

    const appointment = await Appointment.create(appointmentData);

    res.status(201).json({
      message: "Appointment created successfully",
      data: appointment,
    });
  } catch (err) {
    console.error("Appointment creation error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// ==================== GET: All Appointments ====================
router.get("/", async (req, res) => {
  try {
    const { salon_id, date } = req.query;
    if (!salon_id) {
      return res.status(400).json({ success: false, message: "salon_id is required" });
    }

    let query = { salon_id };
    if (date) {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate)) {
        return res.status(400).json({ success: false, message: "Invalid date format" });
      }
      const startOfDay = new Date(parsedDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(parsedDate.setHours(23, 59, 59, 999));
      query.appointment_date = { $gte: startOfDay, $lte: endOfDay };
    }

    const appointments = await Appointment.find(query)
      .populate({
        path: "customer_id",
        select: "-password -image",
        populate: [
          {
            path: "branch_packages.branch_package_id",
            model: "BranchPackage"
          },
          {
            path: "branch_memberships.branch_membership_id",
            model: "BranchMembership",
            select:
              "_id salon_id membership_name description subscription_plan status discount discount_type membership_amount"
          }
        ]
      })
      .populate("services.service_id", "-image")
      .populate("services.staff_id", "-password -image")
      .populate("products.product_id", "-image")
      .populate("products.variant_id", "-image")
      .populate("products.staff_id", "-password -image")
      .populate("branch_id", "name")
      .populate({
        path: "branch_package",
        model: "CustomerPackage",
        populate: { path: "branch_package_id", model: "BranchPackage" }
      })
      .populate({
        path: "branch_membership",
        model: "CustomerMembership",
        populate: { path: "branch_membership", model: "BranchMembership" }
      })
      .lean();

    const details = await Promise.all(
      appointments.map(async (appointment) => {
        const service_total_amount = (appointment.services || []).reduce(
          (sum, s) => sum + (s.service_amount || 0),
          0
        );
        const product_total_amount = (appointment.products || []).reduce(
          (sum, p) => sum + (p.total_price || 0),
          0
        );

        let customer = appointment.customer_id || {};

        // 🔹 Handle old branch_packages
        if ((!customer.branch_packages || customer.branch_packages.length === 0) && customer.branch_package) {
          const packages = await BranchPackage.find({
            _id: { $in: customer.branch_package }
          }).lean();

          customer.branch_packages = packages.map((pkg) => ({
            branch_package_id: pkg, // full details
            bought_at: customer.branch_package_bought_at,
            valid_till: customer.branch_package_valid_till,
            status:
              customer.branch_package_valid_till &&
                new Date(customer.branch_package_valid_till) < new Date()
                ? "expired"
                : "active"
          }));
        }

        // 🔹 Handle old branch_memberships
        if ((!customer.branch_memberships || customer.branch_memberships.length === 0) && customer.branch_membership) {
          const membership = await BranchMembership.findById(customer.branch_membership)
            .select(
              "_id salon_id membership_name description subscription_plan status discount discount_type membership_amount"
            )
            .lean();

          if (membership) {
            customer.branch_memberships = [
              {
                branch_membership_id: membership, // full details
                bought_at: customer.branch_membership_bought_at,
                valid_till: customer.branch_membership_valid_till,
                status:
                  customer.branch_membership_valid_till &&
                    new Date(customer.branch_membership_valid_till) < new Date()
                    ? "expired"
                    : "active"
              }
            ];
          }
        }

        // 🔹 Active flags only (string, not duplicate objects)
        const active_branch_package =
          (customer.branch_packages || []).some(
            (bp) => bp.valid_till && new Date(bp.valid_till) > new Date()
          )
            ? "active"
            : "inactive";

        const active_branch_membership =
          (customer.branch_memberships || []).some(
            (bm) => bm.valid_till && new Date(bm.valid_till) > new Date()
          )
            ? "active"
            : "inactive";

        return {
          appointment_id: appointment._id,
          appointment_date: appointment.appointment_date,
          appointment_time: appointment.appointment_time,
          notes: appointment.notes,
          customer: {
            ...customer,
            active_branch_package,
            active_branch_membership
          },
          branch: appointment.branch_id,
          services: (appointment.services || []).map((s) => ({
            service: s.service_id || null,
            staff: s.staff_id || null,
            service_amount: s.service_amount
          })),
          products: (appointment.products || []).map((p) => ({
            id: p.product_id?._id,
            name: p.product_id?.product_name,
            description: p.product_id?.description,
            price: p.variant_id?.price || p.product_id?.price || 0,
            stock: p.variant_id?.stock || p.product_id?.stock || 0,
            quantity: p.quantity,
            unit_price: p.unit_price || p.product_id?.price || 0,
            brand: p.product_id?.brand_id,
            category: p.product_id?.category_id,
            tag: p.product_id?.tag_id,
            unit: p.product_id?.unit_id,
            variant: p.variant_id || null,
            staff: p.staff_id || null
          })),
          branch_package:
            appointment.branch_package && appointment.branch_package._id
              ? appointment.branch_package
              : null,
          branch_membership:
            appointment.branch_membership && appointment.branch_membership._id
              ? appointment.branch_membership
              : null,
          status: appointment.status,
          payment_status: appointment.payment_status,
          total_payment: appointment.total_payment,
          service_total_amount,
          product_total_amount,
          coupon_discount: appointment.coupon_discount || 0,
          additional_discount: appointment.additional_discount || 0,
          discount: appointment.discount,
          tips: appointment.tips,
          tax_amount: appointment.tax_amount,
          invoice_id: appointment.invoice_id,
          order_code: appointment.order_code
        };
      })
    );

    res.status(200).json({ success: true, data: details });
  } catch (error) {
    console.error("Error fetching appointment details:", error);
    res
      .status(500)
      .json({ success: false, message: "Internal Server Error", error: error.message });
  }
});

// ==================== GET: Appointments by Branch ====================
router.get("/by-branch", async (req, res) => {
  try {
    const { salon_id, branch_id, date } = req.query;
    if (!salon_id || !branch_id) {
      return res
        .status(400)
        .json({ success: false, message: "salon_id and branch_id are required" });
    }

    const mongoose = require("mongoose");
    const BranchPackage = require("../models/BranchPackage");
    const BranchMembership = require("../models/BranchMembership");

    let query = {
      salon_id: new mongoose.Types.ObjectId(salon_id),
      branch_id: new mongoose.Types.ObjectId(branch_id),
    };

    if (date) {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate)) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid date format" });
      }
      const startOfDay = new Date(parsedDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(parsedDate.setHours(23, 59, 59, 999));
      query.appointment_date = { $gte: startOfDay, $lte: endOfDay };
    }

    const appointments = await Appointment.find(query)
      .populate({
        path: "customer_id",
        select: "-password -image",
        populate: [
          {
            path: "branch_packages.branch_package_id",
            model: "BranchPackage",
          },
          {
            path: "branch_memberships.branch_membership_id",
            model: "BranchMembership",
            select:
              "_id salon_id membership_name description subscription_plan status discount discount_type membership_amount",
          },
        ],
      })
      .populate({ path: "products.staff_id", select: "-password -image" })
      .populate({ path: "services.service_id", select: "-image" })
      .populate({ path: "services.staff_id", select: "-password -image" })
      .populate("branch_id", "name")
      .populate({ path: "products.product_id", select: "-image" })
      .populate("products.variant_id")
      .lean();

    const details = await Promise.all(
      appointments.map(async (appointment) => {
        const service_total_amount = (appointment.services || []).reduce(
          (sum, s) => sum + (s.service_amount || 0),
          0
        );
        const product_total_amount = (appointment.products || []).reduce(
          (sum, p) => sum + (p.total_price || 0),
          0
        );

        let customer = appointment.customer_id || {};

        // 🔹 Normalize old branch_packages
        if (
          (!customer.branch_packages || customer.branch_packages.length === 0) &&
          customer.branch_package
        ) {
          const packages = await BranchPackage.find({
            _id: { $in: customer.branch_package },
          }).lean();

          customer.branch_packages = packages.map((pkg) => ({
            branch_package_id: pkg,
            bought_at: customer.branch_package_bought_at,
            valid_till: customer.branch_package_valid_till,
            status:
              customer.branch_package_valid_till &&
                new Date(customer.branch_package_valid_till) < new Date()
                ? "expired"
                : "active",
          }));
        }

        // 🔹 Normalize old branch_memberships
        if (
          (!customer.branch_memberships ||
            customer.branch_memberships.length === 0) &&
          customer.branch_membership
        ) {
          const membership = await BranchMembership.findById(
            customer.branch_membership
          )
            .select(
              "_id salon_id membership_name description subscription_plan status discount discount_type membership_amount"
            )
            .lean();

          if (membership) {
            customer.branch_memberships = [
              {
                branch_membership_id: membership,
                bought_at: customer.branch_membership_bought_at,
                valid_till: customer.branch_membership_valid_till,
                status:
                  customer.branch_membership_valid_till &&
                    new Date(customer.branch_membership_valid_till) < new Date()
                    ? "expired"
                    : "active",
              },
            ];
          }
        }

        // 🔹 Active flags only
        const active_branch_package =
          (customer.branch_packages || []).some(
            (bp) => bp.valid_till && new Date(bp.valid_till) > new Date()
          )
            ? "active"
            : "inactive";

        const active_branch_membership =
          (customer.branch_memberships || []).some(
            (bm) => bm.valid_till && new Date(bm.valid_till) > new Date()
          )
            ? "active"
            : "inactive";

        return {
          appointment_id: appointment._id,
          appointment_date: appointment.appointment_date,
          appointment_time: appointment.appointment_time,
          notes: appointment.notes,
          customer: {
            ...customer,
            active_branch_package,
            active_branch_membership,
          },
          branch: appointment.branch_id,
          services: (appointment.services || []).map((s) => ({
            service: s.service_id || null,
            staff: s.staff_id || null,
            service_amount: s.service_amount,
          })),
          products: (appointment.products || []).map((p) => ({
            id: p.product_id?._id,
            name: p.product_id?.product_name,
            description: p.product_id?.description,
            price: p.variant_id?.price || p.product_id?.price || 0,
            stock: p.variant_id?.stock || p.product_id?.stock || 0,
            quantity: p.quantity,
            unit_price: p.unit_price || p.product_id?.price || 0,
            brand: p.product_id?.brand_id,
            category: p.product_id?.category_id,
            tag: p.product_id?.tag_id,
            unit: p.product_id?.unit_id,
            variant: p.variant_id || null,
            staff: p.staff_id || null,
          })),
          status: appointment.status,
          payment_status: appointment.payment_status,
          total_payment: appointment.total_payment,
          service_total_amount,
          product_total_amount,
          coupon_discount: appointment.coupon_discount || 0,
          additional_discount: appointment.additional_discount || 0,
          discount: appointment.discount,
          tips: appointment.tips,
          tax_amount: appointment.tax_amount,
          invoice_id: appointment.invoice_id,
          order_code: appointment.order_code,
        };
      })
    );

    res.status(200).json({ success: true, data: details });
  } catch (error) {
    console.error("Error fetching appointment details:", error);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

// Update appointment
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!updateData || Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: "No data provided for update" });
    }

    let total_payment = 0;
    const updatedServices = [];
    const updatedProducts = [];

    const existingAppointment = await Appointment.findById(id).populate("products.product_id");
    if (!existingAppointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    // 🔄 Restore stock from old products
    for (const oldProd of existingAppointment.products) {
      const prodDoc = await Product.findById(oldProd.product_id);
      if (!prodDoc) continue;

      if (oldProd.variant_id) {
        const variant = prodDoc.variants.find(v => v._id.toString() === oldProd.variant_id.toString());
        if (variant) {
          variant.stock += oldProd.quantity; // restore old quantity
        }
      } else {
        prodDoc.stock = (prodDoc.stock || 0) + oldProd.quantity;
      }
      await prodDoc.save();
    }

    // ---- Services ----
    if (updateData.services && Array.isArray(updateData.services)) {
      for (const svc of updateData.services) {
        const { service_id, staff_id } = svc;

        const srv = await Service.findById(service_id);
        if (!srv) return res.status(404).json({ message: "Service not found" });

        const service_amount = srv.regular_price;
        total_payment += service_amount;

        updatedServices.push({
          service_id,
          staff_id,
          service_amount,
          used_package: false,
          package_id: null
        });
      }
      updateData.services = updatedServices;
    }

    // ---- Products ----
    if (updateData.products && Array.isArray(updateData.products)) {
      for (const prod of updateData.products) {
        const { product_id, variant_id, quantity, staff_id } = prod;
        const qty = parseInt(quantity) || 1;

        const prodDoc = await Product.findById(product_id);
        if (!prodDoc) return res.status(404).json({ message: "Product not found" });

        let unit_price;
        if (variant_id) {
          const variant = prodDoc.variants.find(v => v._id.toString() === variant_id);
          if (!variant || typeof variant.price !== "number") {
            return res.status(400).json({ message: "Variant or price unavailable" });
          }

          if (variant.stock < qty) {
            return res.status(400).json({ message: "Insufficient stock for variant" });
          }

          variant.stock -= qty;
          unit_price = variant.price;
        } else {
          if ((prodDoc.stock || 0) < qty) {
            return res.status(400).json({ message: "Insufficient stock for product" });
          }

          prodDoc.stock -= qty;
          unit_price = prodDoc.price || 0;
        }

        await prodDoc.save();

        const total_price = unit_price * qty;
        total_payment += total_price;

        updatedProducts.push({
          product_id,
          variant_id: variant_id || null,
          quantity: qty,
          unit_price,
          total_price,
          staff_id: staff_id || null
        });
      }
      updateData.products = updatedProducts;
    }

    const updatedAppointment = await Appointment.findByIdAndUpdate(
      id,
      { ...updateData, total_payment },
      { new: true }
    );

    res.status(200).json({
      message: "Appointment updated successfully",
      data: updatedAppointment
    });
  } catch (error) {
    console.error("Error updating appointment:", error);
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message
    });
  }
});

// Delete appointment
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deletedAppointment = await Appointment.findByIdAndDelete(id);

    if (!deletedAppointment) {
      return res.status(404).json({ success: false, message: "Appointment not found" });
    }

    res.status(200).json({ success: true, message: "Appointment deleted successfully" });
  } catch (error) {
    console.error("Error deleting appointment:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

// Patch appointment status or payment
router.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, payment_status } = req.body;

    if (!status && !payment_status) {
      return res.status(400).json({
        message: "At least one field (status or payment_status) is required",
      });
    }

    const updateFields = {};
    if (status) updateFields.status = status;
    if (payment_status) updateFields.payment_status = payment_status;

    // ✅ Populate only the fields we need (skip image)
    const appointment = await Appointment.findById(id).populate({
      path: "services.service_id",
      select: "_id name price duration", // only include these fields
    });

    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    // Update status/payment_status
    if (status) appointment.status = status;
    if (payment_status) appointment.payment_status = payment_status;

    // ✅ Only when status is check-out, reduce package quantities
    if (status === "check-out") {
      for (const svc of appointment.services) {
        if (svc.used_package && svc.package_id) {
          await CustomerPackage.findOneAndUpdate(
            {
              _id: svc.package_id,
              "package_details.service_id": svc.service_id._id,
              "package_details.quantity": { $gt: 0 },
            },
            { $inc: { "package_details.$.quantity": -1 } }
          );
        }
      }
    }

    await appointment.save();

    res.status(200).json({
      message: "Appointment updated successfully",
      appointment,
    });
  } catch (error) {
    console.error("Error updating appointment:", error);
    res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

router.get("/order-report", async (req, res) => {
  try {
    const { salon_id } = req.query;

    if (!salon_id) {
      return res.status(400).json({ message: "salon_id is required" });
    }

    const appointments = await Appointment.find({ salon_id, "products.0": { $exists: true } })
      .populate("customer_id", "full_name email phone_number image");

    const report = appointments.map(appointment => {
      return {
        order_code: appointment.order_code || "N/A",
        order_date: appointment.createdAt?.toISOString().split("T")[0] || "N/A",
        customer: {
          id: appointment.customer_id?._id,
          name: appointment.customer_id?.full_name || "N/A",
          phone_number: appointment.customer_id?.phone_number || "N/A",
          email: appointment.customer_id?.email || "N/A",
          image: appointment.customer_id?.image || null  // use null if no image
        },
        product_count: appointment.products?.length || 0,
        total_payment: appointment.total_payment || 0,
        payment_status: appointment.payment_status || "Pending"
      };
    });

    res.status(200).json({ success: true, data: report });
  } catch (error) {
    console.error("Error fetching order report:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

router.get("/overall-booking", async (req, res) => {
  try {
    const { salon_id } = req.query;

    if (!salon_id) {
      return res.status(400).json({ message: "salon_id is required" });
    }

    const appointments = await Appointment.find({ salon_id })
      .populate("services.staff_id", "full_name email image")
      .populate("services.service_id", "service_amount")
      .lean();

    const staffSummary = {};

    appointments.forEach((appointment) => {
      const appointmentDate = appointment.appointment_date?.toISOString().split("T")[0];

      appointment.services.forEach((service) => {
        const staffId = service.staff_id?._id;
        if (!staffId) return;

        if (!staffSummary[staffId]) {
          staffSummary[staffId] = {
            staff_name: service.staff_id.full_name,
            staff_email: service.staff_id.email,
            staff_image: service.staff_id.image,
            appointment_date: appointmentDate,
            service_count: 0,
            total_service_amount: 0,
            tax_amount: 0,
            tips_amount: 0,
            invoice_id: 'N/A',
          };
        }

        // Ensure `appointment_date` is included in the staff summary response.
        staffSummary[staffId].appointment_date = appointmentDate;

        staffSummary[staffId].service_count += 1;
        staffSummary[staffId].total_service_amount += service.service_amount || 0;
        staffSummary[staffId].total_amount =
          staffSummary[staffId].total_service_amount +
          staffSummary[staffId].tax_amount +
          staffSummary[staffId].tips_amount;
      });
    });

    res.status(200).json({ success: true, data: Object.values(staffSummary) });
  } catch (error) {
    console.error("Error fetching overall booking details:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

router.get("/upcoming", async (req, res) => {
  try {
    const { salon_id } = req.query;

    if (!salon_id) {
      return res.status(400).json({ message: "salon_id is required" });
    }

    const today = new Date();
    const upcomingAppointments = await Appointment.find({
      salon_id,
      appointment_date: { $gte: today },
    })
      .populate("customer_id", "full_name email phone_number")
      .populate("services.service_id", "name regular_price members_price")
      .populate("services.staff_id", "full_name email phone_number")
      .populate("products.product_id", "product_name description price")
      .populate("products.variant_id", "combination name");

    res.status(200).json({ success: true, data: upcomingAppointments });
  } catch (error) {
    console.error("Error fetching upcoming appointments:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

router.get('/orders', async (req, res) => {
  try {
    const { salon_id } = req.query;

    if (!salon_id) {
      return res.status(400).json({ success: false, message: 'salon_id is required' });
    }

    const appointments = await Appointment.find({ salon_id, products: { $exists: true, $ne: [] } })
      .populate('customer_id', 'full_name phone_number')
      .populate('products.product_id')
      .populate('products.variant_id')
      .lean();

    const orders = appointments.map((appointment) => {
      const products = appointment.products.map((product) => ({
        id: product.product_id?._id,
        name: product.product_id?.product_name,
        description: product.product_id?.description,
        price: product.variant_id?.price || product.product_id?.price,
        stock: product.variant_id?.stock || product.product_id?.stock,
        image: product.product_id?.image,
        brand: product.product_id?.brand_id,
        category: product.product_id?.category_id,
        tag: product.product_id?.tag_id,
        unit: product.product_id?.unit_id,
        variant: product.variant_id || null,
      }));

      return {
        order_code: appointment.order_code || null,
        customer_name: appointment.customer_id?.full_name || 'N/A',
        customer_id: appointment.customer_id?._id || null,
        customer_phone: appointment.customer_id?.phone_number || 'N/A',
        appointment_date: appointment.appointment_date,
        products,
        payment: appointment.total_payment || 0,
        status: appointment.payment_status === 'Paid' ? 'Paid' : 'Pending',
        notes: appointment.notes || null,
      };
    });

    res.status(200).json({ success: true, data: orders });
  } catch (error) {
    console.error('Error fetching orders from appointments:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// ✅ Get appointments by salon_id and date
router.get("/by-date", async (req, res) => {
  try {
    const { salon_id, date } = req.query;

    if (!salon_id || !date) {
      return res.status(400).json({ message: "salon_id and date are required" });
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate)) {
      return res.status(400).json({ message: "Invalid date format" });
    }

    const startOfDay = new Date(parsedDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(parsedDate.setHours(23, 59, 59, 999));

    const appointments = await Appointment.find({
      salon_id,
      appointment_date: { $gte: startOfDay, $lte: endOfDay },
    })
      .populate("customer_id", "full_name email phone_number")
      .populate("services.service_id", "name regular_price members_price")
      .populate("services.staff_id", "full_name email phone_number")
      .populate("products.product_id", "product_name description price")
      .populate("products.variant_id", "combination name");

    res.status(200).json({ success: true, data: appointments });
  } catch (error) {
    console.error("Error fetching appointments by date:", error);
    res.status(500).json({ message: "Internal Server Error", error: error.message });
  }
});

module.exports = router;