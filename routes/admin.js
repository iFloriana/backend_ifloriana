// routes/admin.js
const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const Salon = require('../models/Salon');
const bcrypt = require('bcryptjs');
const mongoose = require("mongoose"); 
const path = require("path");
const getUploader = require("../middleware/imageUpload");
const upload = getUploader(); // Multer config

// Get all admins
router.get("/all", async (req, res) => {
  try {
    const admins = await Admin.find().populate("package_id");
    res.status(200).json(admins);
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// Update admin by ID
router.put('/:id', upload.single("image"), async (req, res) => {
  try {
    const { password, salonDetails, ...adminFields } = req.body;
    const updateData = { ...adminFields };

    // Handle password update only if it's non-empty
    if (password && password.trim() !== "") {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateData.password = hashedPassword;
    }

    // ✅ Update admin fields
    const updatedAdmin = await Admin.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updatedAdmin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    // ✅ Prepare salon update data
    const salonUpdate = {};
    if (salonDetails && typeof salonDetails === "string") {
      // If salonDetails is sent as JSON string
      try {
        parsedSalonDetails = JSON.parse(salonDetails);
        if (parsedSalonDetails.salon_name) salonUpdate.salon_name = parsedSalonDetails.salon_name;
      } catch {
        return res.status(400).json({ message: "Invalid salonDetails JSON" });
      }
    } else if (salonDetails) {
      if (salonDetails.salon_name) salonUpdate.salon_name = salonDetails.salon_name;
    }

    // ✅ Handle salon image upload
    if (req.file) {
      salonUpdate.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: req.file.originalname,
        extension: path.extname(req.file.originalname).slice(1),
      };
    }

    // ✅ Update salon if any changes
    if (Object.keys(salonUpdate).length > 0) {
      await Salon.findOneAndUpdate(
        { signup_id: req.params.id },
        salonUpdate,
        { new: true }
      );
    }

    // ✅ Fetch salon details after update
    const salonDetailsFetched = await Salon.findOne({ signup_id: req.params.id });

    // ✅ Add image URL if exists
    if (salonDetailsFetched?.image?.data) {
      salonDetailsFetched._doc.image_url = `/api/salons/image/${salonDetailsFetched._id}.${salonDetailsFetched.image.extension || "jpg"}`;
      delete salonDetailsFetched._doc.image;
    }

    res.status(200).json({
      message: 'Admin updated successfully',
      admin: updatedAdmin,
      salonDetails: salonDetailsFetched,
    });
  } catch (error) {
    console.error("Error updating admin:", error);
    res.status(500).json({ message: 'Server error', error });
  }
});

// Delete admin by ID
router.delete("/:id", async (req, res) => {
  try {
    const deletedAdmin = await Admin.findByIdAndDelete(req.params.id);
    if (!deletedAdmin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    res.status(200).json({ message: "Admin deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

// Get single admin by ID
router.get("/:id", async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id).populate("package_id");
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    // Fetch salon details using signup_id
    const salon = await Salon.findOne({ signup_id: req.params.id }).lean();

    if (!salon) {
      return res.status(404).json({ message: "Salon not found" });
    }

    // ✅ Add image_url instead of base64
    let salonWithImage = { ...salon };
    if (salon.image?.data) {
      salonWithImage.image_url = `/api/salons/image/${salon._id}.${salon.image?.extension || "jpg"}`;
    } else {
      salonWithImage.image_url = null;
    }

    // Remove raw image field from response
    delete salonWithImage.image;

    res.status(200).json({
      admin,
      salonDetails: salonWithImage,
    });
  } catch (error) {
    console.error("Error fetching admin and salon:", error);
    res.status(500).json({ message: "Server error", error });
  }
});

module.exports = router;