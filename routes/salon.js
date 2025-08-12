const express = require("express");
const Salon = require("../models/Salon");
const router = express.Router();
const getUploader = require("../middleware/imageUpload");
const upload = getUploader();
const path = require("path");
const mongoose = require("mongoose");

// ------------------- Create Salon -------------------
router.post("/", upload.single("image"), async (req, res) => {
  if (!req.body || typeof req.body !== "object") {
    return res.status(400).json({ message: "Invalid or missing request body" });
  }

  try {
    const salonData = { ...req.body };

    if (req.file) {
      salonData.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: req.file.originalname,
        extension: path.extname(req.file.originalname).slice(1),
      };
    }

    const newSalon = new Salon(salonData);
    await newSalon.save();

    const obj = newSalon.toObject();
    obj.image_url = newSalon.image?.data
      ? `/api/salons/image/${newSalon._id}.${newSalon.image?.extension || "jpg"}`
      : null;
    delete obj.image;

    res.status(201).json({
      message: "Salon created successfully",
      data: obj,
    });
  } catch (error) {
    console.error("Create salon error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ------------------- Get All Salons -------------------
router.get("/", async (req, res) => {
  try {
    const salons = await Salon.find({}).populate("package_id");

    const data = salons.map((salon) => {
      const obj = salon.toObject();
      obj.image_url = salon.image?.data
        ? `/api/salons/image/${salon._id}.${salon.image?.extension || "jpg"}`
        : null;
      delete obj.image;
      return obj;
    });

    res.status(200).json({ message: "Salons fetched successfully", data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// ------------------- Get Single Salon -------------------
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const salon = await Salon.findById(id).populate("package_id");
    if (!salon) {
      return res.status(404).json({ message: "Salon not found" });
    }

    const obj = salon.toObject();
    obj.image_url = salon.image?.data
      ? `/api/salons/image/${salon._id}.${salon.image?.extension || "jpg"}`
      : null;
    delete obj.image;

    res.status(200).json({ message: "Salon fetched successfully", data: obj });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// ------------------- Update Salon -------------------
router.put("/:id", upload.single("image"), async (req, res) => {
  const { id } = req.params;
  try {
    const updateData = { ...req.body };

    if (req.file) {
      updateData.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: req.file.originalname,
        extension: req.file.originalname.split(".").pop(),
      };
    }

    const updatedSalon = await Salon.findByIdAndUpdate(id, updateData, { new: true });

    if (!updatedSalon) {
      return res.status(404).json({ message: "Salon not found" });
    }

    const obj = updatedSalon.toObject();
    obj.image_url = updatedSalon.image?.data
      ? `/api/salons/image/${updatedSalon._id}.${updatedSalon.image?.extension || "jpg"}`
      : null;
    delete obj.image;

    res.status(200).json({ message: "Salon updated successfully", data: obj });
  } catch (error) {
    console.error("Update salon error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ------------------- Delete Salon -------------------
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const deletedSalon = await Salon.findByIdAndDelete(id);
    if (!deletedSalon) {
      return res.status(404).json({ message: "Salon not found" });
    }
    res.status(200).json({ message: "Salon deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// ------------------- Serve Salon Image -------------------
router.get("/image/:filename", async (req, res) => {
  try {
    const id = req.params.filename.split(".")[0];

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Salon ID" });
    }

    const salon = await Salon.findById(id);
    if (!salon?.image?.data) {
      return res.status(404).json({ message: "Image not found" });
    }

    const contentType = salon.image.contentType || "image/jpeg";
    res.type(contentType);
    res.set("Content-Disposition", "inline");
    res.send(Buffer.from(salon.image.data));
  } catch (error) {
    console.error("Image fetch error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;