const express = require("express");
const mongoose = require("mongoose");
const Staff = require("../models/Staff");
const Service = require("../models/Service");
const getUploader = require("../middleware/imageUpload");
const upload = getUploader(); 
const path = require("path");

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
      s.image_url = s.image?.data
        ? `/api/staffs/image/${s._id}.${s.image?.extension || "jpg"}`
        : null;
      delete s.image;

      if (s.branch_id && typeof s.branch_id === "object" && s.branch_id !== null) {
        s.branch_id.image_url = s.branch_id.image?.data
          ? `/api/branch/image/${s.branch_id._id}.${s.branch_id.image?.extension || "jpg"}`
          : null;
        delete s.branch_id.image;
      }

      if (s.service_id && typeof s.service_id === "object" && s.service_id !== null) {
        s.service_id.image_url = s.service_id.image?.data
          ? `/api/services/image/${s.service_id._id}.${s.service_id.image?.extension || "jpg"}`
          : null;
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
      s.image_url = s.image?.data
        ? `/api/staffs/image/${s._id}.${s.image?.extension || "jpg"}`
        : null;
      delete s.image;

      if (s.branch_id && typeof s.branch_id === "object" && s.branch_id !== null) {
        s.branch_id.image_url = s.branch_id.image?.data
          ? `/api/branch/image/${s.branch_id._id}.${s.branch_id.image?.extension || "jpg"}`
          : null;
        delete s.branch_id.image;
      }

      if (s.service_id && typeof s.service_id === "object" && s.service_id !== null) {
        s.service_id.image_url = s.service_id.image?.data
          ? `/api/services/image/${s.service_id._id}.${s.service_id.image?.extension || "jpg"}`
          : null;
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

    staff.image_url = staff.image?.data
      ? `/api/staffs/image/${staff._id}.${staff.image?.extension || "jpg"}`
      : null;
    delete staff.image;

    if (staff.branch_id && typeof staff.branch_id === "object" && staff.branch_id !== null) {
      staff.branch_id.image_url = staff.branch_id.image?.data
        ? `/api/branch/image/${staff.branch_id._id}.${staff.branch_id.image?.extension || "jpg"}`
        : null;
      delete staff.branch_id.image;
    }

    if (staff.service_id && typeof staff.service_id === "object" && staff.service_id !== null) {
      staff.service_id.image_url = staff.service_id.image?.data
        ? `/api/services/image/${staff.service_id._id}.${staff.service_id.image?.extension || "jpg"}`
        : null;
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