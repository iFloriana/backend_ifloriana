const express = require("express");
const mongoose = require("mongoose");
const Staff = require("../models/Staff");
const Service = require("../models/Service");
const getUploader = require("../middleware/imageUpload");
const upload = getUploader();
const path = require("path");
const Appointment = require("../models/Appointment");

const router = express.Router();

// ------------------- Serve Image -------------------
router.get("/image/:filename", async (req, res) => {
  try {
    const [id, extension] = req.params.filename.match(/^([^\.]+)\.(.+)$/)?.slice(1) || [];

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Staff ID" });
    }

    const staff = await Staff.findById(id);
    if (!staff?.image?.data) {
      return res.status(404).json({ message: "Image not found" });
    }

    res.set("Content-Type", staff.image.contentType || "image/jpeg");
    res.set("Content-Disposition", "inline");
    res.send(Buffer.from(staff.image.data));
  } catch (error) {
    console.error("Staff image fetch error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ------------------- Create Staff -------------------
router.post("/", upload.single("image"), async (req, res) => {
  const {
    full_name,
    email,
    phone_number,
    gender,
    branch_id,
    salon_id,
    service_id,
    status,
    show_in_calendar,
    assign_time,
    lunch_time,
    specialization,
    assigned_commission_id,
  } = req.body;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const image = req.file
      ? {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: req.file.originalname,
        extension: path.extname(req.file.originalname).slice(1),
      }
      : undefined;

    const newStaff = new Staff({
      full_name,
      email,
      phone_number,
      gender,
      branch_id,
      salon_id,
      service_id,
      status,
      image,
      show_in_calendar,
      assign_time,
      lunch_time,
      specialization,
      assigned_commission_id,
    });

    await newStaff.save();

    const obj = newStaff.toObject();
    obj.image_url = image
      ? `/api/staffs/image/${newStaff._id}.${image.extension || "jpg"}`
      : null;
    delete obj.image;

    res.status(201).json({ message: "Staff created successfully", data: obj });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// ------------------- Get Staff Names -------------------
router.get("/names", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const staffList = await Staff.find({ salon_id }, { _id: 1, full_name: 1 }).lean();

    res.status(200).json({
      message: "Staff names and IDs fetched successfully",
      data: staffList,
    });
  } catch (error) {
    console.error("Error fetching staff names:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// ------------------- Get All Staff -------------------
router.get("/", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const staff = await Staff.find({ salon_id })
      .populate("branch_id")
      .populate("service_id")
      .lean();

    const enriched = staff.map((s) => {
      // ✅ Staff image
      s.image_url = s.image?.data
        ? `/api/staffs/image/${s._id}.${s.image?.extension || "jpg"}`
        : null;
      delete s.image;

      // ✅ Branch image
      if (s.branch_id && typeof s.branch_id === "object") {
        s.branch_id.image_url = s.branch_id.image?.data
          ? `/api/branch/image/${s.branch_id._id}.${s.branch_id.image?.extension || "jpg"}`
          : null;
        delete s.branch_id.image;
      }

      // ✅ Service images (fix for array & single object)
      if (Array.isArray(s.service_id)) {
        s.service_id = s.service_id.map((service) => {
          if (service?.image?.data) {
            service.image_url = `/api/services/image/${service._id}.${service.image?.extension || "jpg"}`;
          } else {
            service.image_url = null;
          }
          delete service.image;
          return service;
        });
      } else if (s.service_id && typeof s.service_id === "object") {
        if (s.service_id.image?.data) {
          s.service_id.image_url = `/api/services/image/${s.service_id._id}.${s.service_id.image?.extension || "jpg"}`;
        } else {
          s.service_id.image_url = null;
        }
        delete s.service_id.image;
      }

      return s;
    });

    res.status(200).json({ message: "Staff fetched successfully", data: enriched });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// ------------------- Get Staff by Branch -------------------
router.get("/by-branch", async (req, res) => {
  const { salon_id, branch_id } = req.query;

  if (!salon_id || !branch_id) {
    return res.status(400).json({ message: "salon_id and branch_id are required" });
  }

  try {
    const staff = await Staff.find({ salon_id, branch_id })
      .populate("branch_id")
      .populate("service_id")
      .lean();

    const enriched = staff.map((s) => {
      // ✅ Staff image
      s.image_url = s.image?.data
        ? `/api/staffs/image/${s._id}.${s.image?.extension || "jpg"}`
        : null;
      delete s.image;

      // ✅ Branch image
      if (s.branch_id && typeof s.branch_id === "object") {
        s.branch_id.image_url = s.branch_id.image?.data
          ? `/api/branch/image/${s.branch_id._id}.${s.branch_id.image?.extension || "jpg"}`
          : null;
        delete s.branch_id.image;
      }

      // ✅ Service images
      if (Array.isArray(s.service_id)) {
        s.service_id = s.service_id.map((service) => {
          if (service?.image?.data) {
            service.image_url = `/api/services/image/${service._id}.${service.image?.extension || "jpg"}`;
          } else {
            service.image_url = null;
          }
          delete service.image;
          return service;
        });
      } else if (s.service_id && typeof s.service_id === "object") {
        if (s.service_id.image?.data) {
          s.service_id.image_url = `/api/services/image/${s.service_id._id}.${s.service_id.image?.extension || "jpg"}`;
        } else {
          s.service_id.image_url = null;
        }
        delete s.service_id.image;
      }

      return s;
    });

    res.status(200).json({ message: "Staff fetched successfully", data: enriched });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// GET /performance/:id
router.get("/performance/:id", async (req, res) => {
  try {
    const { id: staff_id } = req.params;
    const { salon_id, start_date, end_date } = req.query;

    if (!salon_id) {
      return res.status(400).json({ message: "salon_id is required" });
    }

    const mongoose = require("mongoose");
    if (!mongoose.Types.ObjectId.isValid(staff_id)) {
      return res.status(400).json({ message: "Invalid staff_id" });
    }

    // ===== Date filter handling =====
    const dateFilter = {};
    if (start_date) {
      dateFilter.$gte = new Date(start_date);
    }
    if (end_date) {
      dateFilter.$lte = new Date(end_date);
    }

    // ====== Fetch Appointments (check-out only) ======
    const appointmentQuery = {
      salon_id,
      status: "check-out",
      "services.staff_id": staff_id
    };
    if (Object.keys(dateFilter).length) {
      appointmentQuery.appointment_date = dateFilter;
    }

    const appointments = await Appointment.find(appointmentQuery).lean();

    let appointmentCount = 0;
    let serviceAmount = 0;
    let productAmountFromAppointments = 0;

    appointments.forEach((apt) => {
      let involved = false;

      // Services handled by staff
      (apt.services || []).forEach((srv) => {
        if (srv.staff_id?.toString() === staff_id.toString()) {
          serviceAmount += Number(srv.service_amount || 0);
          involved = true;
        }
      });

      // Products sold by staff (inside appointment)
      (apt.products || []).forEach((prd) => {
        if (prd.staff_id?.toString() === staff_id.toString()) {
          productAmountFromAppointments += Number(prd.total_price || 0);
          involved = true;
        }
      });

      if (involved) appointmentCount += 1;
    });

    // ====== Fetch Orders (standalone) ======
    const orderQuery = { salon_id, staff_id };
    if (Object.keys(dateFilter).length) {
      orderQuery.date = dateFilter;
    }

    const orders = await require("../models/Order").find(orderQuery).lean();
    const productAmountFromOrders = orders.reduce(
      (sum, ord) => sum + (ord.total_price || 0),
      0
    );

    // === Commission Calculation (date filtered) ===
    let commission_earned = 0;
    const Staff = require("../models/Staff");
    const RevenueCommission = require("../models/RevenueCommission");

    const staff = await Staff.findOne({ _id: staff_id, salon_id });
    if (staff) {
      const commissionId = staff.assigned_commission_id || staff.commission_id;
      if (commissionId) {
        const revComm = await RevenueCommission.findById(commissionId);
        if (revComm && Array.isArray(revComm.commission)) {
          appointments.forEach((apt) => {
            apt.services.forEach((srv) => {
              if (srv.staff_id?.toString() === staff_id.toString()) {
                const amount = Number(srv.service_amount || 0);
                const slot = revComm.commission.find((s) => {
                  const [min, max] = s.slot.split("-").map(Number);
                  return amount >= min && amount <= max;
                });
                if (slot) {
                  commission_earned +=
                    revComm.commission_type === "Percentage"
                      ? (amount * slot.amount) / 100
                      : slot.amount;
                }
              }
            });
          });
          commission_earned = Math.round(commission_earned * 100) / 100;
        }
      }
    }

    // ====== Final Response ======
    res.status(200).json({
      staff_id,
      salon_id,
      appointment_count: appointmentCount,
      total_service_amount: serviceAmount,
      total_product_amount:
        productAmountFromAppointments + productAmountFromOrders,
      commission_earned: commission_earned,
    });
  } catch (error) {
    console.error("Error fetching performance report:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
});

// ------------------- Get Single Staff -------------------
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const staff = await Staff.findOne({ _id: id, salon_id })
      .populate("branch_id")
      .populate("service_id")
      .lean();

    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    // ✅ Staff image
    staff.image_url = staff.image?.data
      ? `/api/staffs/image/${staff._id}.${staff.image?.extension || "jpg"}`
      : null;
    delete staff.image;

    // ✅ Branch image
    if (staff.branch_id && typeof staff.branch_id === "object") {
      staff.branch_id.image_url = staff.branch_id.image?.data
        ? `/api/branch/image/${staff.branch_id._id}.${staff.branch_id.image?.extension || "jpg"}`
        : null;
      delete staff.branch_id.image;
    }

    // ✅ Service images
    if (Array.isArray(staff.service_id)) {
      staff.service_id = staff.service_id.map((service) => {
        if (service?.image?.data) {
          service.image_url = `/api/services/image/${service._id}.${service.image?.extension || "jpg"}`;
        } else {
          service.image_url = null;
        }
        delete service.image;
        return service;
      });
    } else if (staff.service_id && typeof staff.service_id === "object") {
      if (staff.service_id.image?.data) {
        staff.service_id.image_url = `/api/services/image/${staff.service_id._id}.${staff.service_id.image?.extension || "jpg"}`;
      } else {
        staff.service_id.image_url = null;
      }
      delete staff.service_id.image;
    }

    res.status(200).json({ message: "Staff fetched successfully", data: staff });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// ------------------- Update Staff -------------------
router.put("/:id", upload.single("image"), async (req, res) => {
  const { id } = req.params;
  const { salon_id, ...updateData } = req.body;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    if (req.file) {
      updateData.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: req.file.originalname,
        extension: path.extname(req.file.originalname).slice(1),
      };
    }

    const updatedStaff = await Staff.findOneAndUpdate(
      { _id: id, salon_id },
      updateData,
      { new: true }
    ).lean();

    if (!updatedStaff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    updatedStaff.image_url = updatedStaff.image?.data
      ? `/api/staff/image/${updatedStaff._id}.${updatedStaff.image?.extension || "jpg"}`
      : null;
    delete updatedStaff.image;

    res.status(200).json({ message: "Staff updated successfully", data: updatedStaff });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// ------------------- Delete Staff -------------------
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const deletedStaff = await Staff.findOneAndDelete({ _id: id, salon_id });
    if (!deletedStaff) {
      return res.status(404).json({ message: "Staff not found" });
    }
    res.status(200).json({ message: "Staff deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;