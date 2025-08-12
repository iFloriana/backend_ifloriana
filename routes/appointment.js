const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;

const Order = require("../models/Order");
const Appointment = require("../models/Appointment");
const CustomerPackage = require("../models/CustomerPackage");
const Service = require("../models/Service");
const Product = require("../models/Product");
const Coupon = require("../models/Coupon");
const Tax = require("../models/Tax");

const orderHelpers = require("../routes/order");
const generateOrderInvoicePDF = orderHelpers.generateOrderInvoicePDF;
const buildOrderInvoice = orderHelpers.buildOrderInvoice;

// POST: Create Appointment
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
    } = req.body;

    let total_payment = 0;
    const updatedServices = [];

    // Simplified service handling - no package checks
    for (const svc of services) {
      const { service_id, staff_id } = svc;
      
      const srv = await Service.findById(service_id);
      if (!srv) return res.status(404).json({ message: "Service not found" });
      
      const service_amount = srv.regular_price;
      total_payment += service_amount;

      updatedServices.push({
        service_id,
        staff_id,
        service_amount,
        used_package: false, // Keeping field for compatibility
        package_id: null    // Keeping field for compatibility
      });
    }

    const updatedProducts = [];
    
    // Product handling remains the same
    for (const prod of products) {
      const { product_id, variant_id, quantity } = prod;
      const qty = parseInt(quantity);
      if (!qty || qty < 1) {
        return res.status(400).json({ message: "Invalid product quantity" });
      }

      const prodDoc = await Product.findById(product_id);
      if (!prodDoc) return res.status(404).json({ message: "Product not found" });

      let unit_price;
      if (variant_id) {
        const variant = prodDoc.variants.find(v => v._id.toString() === variant_id);
        if (!variant || typeof variant.price !== "number") {
          return res.status(400).json({ message: "Variant or price unavailable" });
        }
        unit_price = variant.price;
      } else {
        unit_price = prodDoc.price || 0;
      }

      const total_price = unit_price * qty;
      total_payment += total_price;

      updatedProducts.push({
        product_id,
        variant_id,
        quantity: qty,
        unit_price,
        total_price
      });
    }

    const appointment = await Appointment.create({
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
      order_code: `ORD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`
    });

    res.status(201).json({ 
      message: "Appointment created successfully", 
      data: appointment 
    });

  } catch (err) {
    console.error("Appointment creation error:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// Get all appointments
router.get('/', async (req, res) => {
  try {
    const { salon_id, date } = req.query;

    if (!salon_id) {
      return res.status(400).json({ success: false, message: 'salon_id is required' });
    }

    let query = { salon_id };
    if (date) {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate)) {
        return res.status(400).json({ success: false, message: 'Invalid date format' });
      }
      const startOfDay = new Date(parsedDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(parsedDate.setHours(23, 59, 59, 999));
      query.appointment_date = { $gte: startOfDay, $lte: endOfDay };
    }

    const appointments = await Appointment.find(query)
      .populate({
        path: 'customer_id',
        populate: [
          { path: 'branch_package', model: 'BranchPackage' },
          { path: 'branch_membership', model: 'BranchMembership' }
        ]
      })
      .populate('services.service_id')
      .populate('services.staff_id')
      .populate('branch_id', 'name')
      .populate('products.product_id')
      .populate('products.variant_id')
      .lean();

    const details = appointments.map((appointment) => {
      const productDetails = appointment.products?.map((p) => ({
        id: p.product_id?._id,
        name: p.product_id?.product_name,
        description: p.product_id?.description,
        price: p.variant_id?.price || p.product_id?.price || 0,
        stock: p.variant_id?.stock || p.product_id?.stock || 0,
        quantity: p.quantity,
        unit_price: p.unit_price || p.product_id?.price || 0,
        image: p.product_id?.image,
        brand: p.product_id?.brand_id,
        category: p.product_id?.category_id,
        tag: p.product_id?.tag_id,
        unit: p.product_id?.unit_id,
        variant: p.variant_id || null
      })) || [];

      const service_total_amount = appointment.services.reduce((sum, s) => sum + (s.service_amount || 0), 0);
      const product_total_amount = (appointment.products || []).reduce((sum, p) => sum + (p.total_price || 0), 0);

      return {
        appointment_id: appointment._id,
        appointment_date: appointment.appointment_date,
        appointment_time: appointment.appointment_time,
        notes: appointment.notes,
        customer: appointment.customer_id,
        branch: appointment.branch_id,
        services: appointment.services.map(s => ({
          service: s.service_id,
          staff: s.staff_id,
          service_amount: s.service_amount
        })),
        products: productDetails,
        branch_package: appointment.customer?.branch_package || null,
        branch_membership: appointment.customer?.branch_membership || null,
        status: appointment.status,
        payment_status: appointment.payment_status,
        total_payment: appointment.total_payment, // This is the final amount to be paid
        service_total_amount,
        product_total_amount,
        coupon_discount: appointment.coupon_discount || 0,
        additional_discount: appointment.additional_discount || 0,
        // membership_discount: appointment.membership_discount || 0, // Include if applicable
        discount: appointment.discount,
        tips: appointment.tips,
        tax_amount: appointment.tax_amount,
        invoice_id: appointment.invoice_id,
        order_code: appointment.order_code
      };

    });

    res.status(200).json({ success: true, data: details });
  } catch (error) {
    console.error('Error fetching appointment details:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error', error: error.message });
  }
});

// get appointments filtered by branch_id
router.get('/by-branch', async (req, res) => {
  try {
    const { salon_id, branch_id, date } = req.query;

    if (!salon_id || !branch_id) {
      return res.status(400).json({ success: false, message: 'salon_id and branch_id are required' });
    }

    let query = { salon_id, branch_id };

    // Optional date filtering
    if (date) {
      const parsedDate = new Date(date);
      if (isNaN(parsedDate)) {
        return res.status(400).json({ success: false, message: 'Invalid date format' });
      }
      const startOfDay = new Date(parsedDate.setHours(0, 0, 0, 0));
      const endOfDay = new Date(parsedDate.setHours(23, 59, 59, 999));
      query.appointment_date = { $gte: startOfDay, $lte: endOfDay };
    }

    const appointments = await Appointment.find(query)
      .populate({
        path: 'customer_id',
        populate: [
          { path: 'branch_package', model: 'BranchPackage' },
          { path: 'branch_membership', model: 'BranchMembership' }
        ]
      })
      .populate('services.service_id')
      .populate('services.staff_id')
      .populate('branch_id', 'name')
      .populate('products.product_id')
      .populate('products.variant_id')
      .lean();

    const details = appointments.map((appointment) => {
      const productDetails = (appointment.products || []).map(p => ({
        id: p.product_id?._id,
        name: p.product_id?.product_name,
        description: p.product_id?.description,
        price: p.variant_id?.price || p.product_id?.price || 0,
        stock: p.variant_id?.stock || p.product_id?.stock || 0,
        quantity: p.quantity,
        unit_price: p.unit_price || p.product_id?.price || 0,
        image: p.product_id?.image,
        brand: p.product_id?.brand_id,
        category: p.product_id?.category_id,
        tag: p.product_id?.tag_id,
        unit: p.product_id?.unit_id,
        variant: p.variant_id || null
      }));

      const service_total_amount = (appointment.services || []).reduce((sum, s) => sum + (s.service_amount || 0), 0);
      const product_total_amount = (appointment.products || []).reduce((sum, p) => sum + (p.total_price || 0), 0);

      return {
        appointment_id: appointment._id,
        appointment_date: appointment.appointment_date,
        appointment_time: appointment.appointment_time,
        notes: appointment.notes,
        customer: appointment.customer_id,
        branch: appointment.branch_id,
        services: (appointment.services || []).map(s => ({
          service: s.service_id,
          staff: s.staff_id,
          service_amount: s.service_amount
        })),
        products: productDetails,
        branch_package: appointment.customer_id?.branch_package || null,
        branch_membership: appointment.customer_id?.branch_membership || null,
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
    });

    res.status(200).json({ success: true, data: details });
  } catch (error) {
    console.error('Error fetching appointment details:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error', error: error.message });
  }
});

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

    // Simplified service handling - no package checks
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
          used_package: false, // Keeping field for compatibility
          package_id: null    // Keeping field for compatibility
        });
      }
      updateData.services = updatedServices;
    }

    // Product handling (optional)
    if (updateData.products && Array.isArray(updateData.products)) {
      for (const prod of updateData.products) {
        const { product_id, variant_id, quantity } = prod;
        const qty = parseInt(quantity) || 1;

        const prodDoc = await Product.findById(product_id);
        if (!prodDoc) return res.status(404).json({ message: "Product not found" });

        let unit_price;
        if (variant_id) {
          const variant = prodDoc.variants.find(v => v._id.toString() === variant_id);
          if (!variant || typeof variant.price !== "number") {
            return res.status(400).json({ message: "Variant or price unavailable" });
          }
          unit_price = variant.price;
        } else {
          unit_price = prodDoc.price || 0;
        }

        const total_price = unit_price * qty;
        total_payment += total_price;

        updatedProducts.push({
          product_id,
          variant_id: variant_id || null,
          quantity: qty,
          unit_price,
          total_price
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
      return res.status(400).json({ message: "At least one field (status or payment_status) is required" });
    }

    const updateFields = {};
    if (status) updateFields.status = status;
    if (payment_status) updateFields.payment_status = payment_status;

    const updatedAppointment = await Appointment.findByIdAndUpdate(id, updateFields, { new: true });

    if (!updatedAppointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }

    res.status(200).json({ message: "Appointment updated successfully", appointment: updatedAppointment });
  } catch (error) {
    console.error("Error updating appointment:", error);
    res.status(500).json({ message: "Internal Server Error", error: error.message });
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