const express = require("express");
const mongoose = require("mongoose");
const Service = require("../models/Service");
const getUploader = require("../middleware/imageUpload");
const upload = getUploader();
const path = require("path");

const router = express.Router();

// ------------------- Serve Image -------------------
router.get("/image/:filename", async (req, res) => {
  try {
    const id = req.params.filename.split(".")[0];

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Service ID" });
    }

    const service = await Service.findById(id);
    if (!service?.image?.data) {
      return res.status(404).json({ message: "Image not found" });
    }

    res.set("Content-Type", service.image.contentType || "image/jpeg");
    res.set("Content-Disposition", "inline");
    res.send(Buffer.from(service.image.data));
  } catch (error) {
    console.error("Service image fetch error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ------------------- Create Service -------------------
router.post("/", upload.single("image"), async (req, res) => {
  const {
    name,
    service_duration,
    regular_price,
    members_price,
    category_id,
    description,
    status,
    salon_id,
  } = req.body;

  if (!salon_id || !mongoose.Types.ObjectId.isValid(salon_id)) {
    return res.status(400).json({ message: "Valid salon_id is required" });
  }

  if (!category_id || !mongoose.Types.ObjectId.isValid(category_id)) {
    return res.status(400).json({ message: "Valid category_id is required" });
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

    const newService = new Service({
      name,
      service_duration,
      regular_price,
      members_price,
      category_id,
      description,
      status,
      salon_id,
      image,
    });

    await newService.save();

    const serviceObj = newService.toObject();
    serviceObj.image_url = image
      ? `/api/services/image/${newService._id}.${image.extension || "jpg"}`
      : null;
    delete serviceObj.image;

    res.status(201).json({ message: "Service created successfully", data: serviceObj });
  } catch (error) {
    console.error("Error while creating service:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ------------------- Get All Services -------------------
router.get("/", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const services = await Service.find({ salon_id })
      .populate("salon_id")
      .populate("category_id")
      .lean();

    const enriched = services.map((s) => {
      // Service image cleanup
      s.image_url = s.image?.data
        ? `/api/services/image/${s._id}.${s.image?.extension || "jpg"}`
        : null;
      delete s.image;

      // Category image cleanup
      if (s.category_id && typeof s.category_id === "object") {
        s.category_id.image_url = s.category_id.image?.data
          ? `/api/categories/image/${s.category_id._id}.${s.category_id.image?.extension || "jpg"}`
          : null;
        delete s.category_id.image;
      }

      // Salon image cleanup
      if (s.salon_id && typeof s.salon_id === "object") {
        s.salon_id.image_url = s.salon_id.image?.data
          ? `/api/salon/image/${s.salon_id._id}.${s.salon_id.image?.extension || "jpg"}`
          : null;
        delete s.salon_id.image;
      }

      return s;
    });

    res.status(200).json({ message: "Services fetched successfully", data: enriched });
  } catch (error) {
    console.error("Error fetching services:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ------------------- Get Service Names -------------------
router.get("/names", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id || !mongoose.Types.ObjectId.isValid(salon_id)) {
    return res.status(400).json({ message: "Valid salon_id is required" });
  }

  try {
    const services = await Service.find({ salon_id }).select("_id name");
    res.status(200).json({ success: true, data: services });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch services", error: error.message });
  }
});

// ------------------- Get Single Service -------------------
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const service = await Service.findOne({ _id: id, salon_id })
      .populate("salon_id")
      .populate("category_id")
      .lean();

    if (!service) {
      return res.status(404).json({ message: "Service not found" });
    }

    // Service image cleanup
    service.image_url = service.image?.data
      ? `/api/services/image/${service._id}.${service.image?.extension || "jpg"}`
      : null;
    delete service.image;

    // Category image cleanup
    if (service.category_id && typeof service.category_id === "object") {
      service.category_id.image_url = service.category_id.image?.data
        ? `/api/categories/image/${service.category_id._id}.${service.category_id.image?.extension || "jpg"}`
        : null;
      delete service.category_id.image;
    }

    // Salon image cleanup
    if (service.salon_id && typeof service.salon_id === "object") {
      service.salon_id.image_url = service.salon_id.image?.data
        ? `/api/salon/image/${service.salon_id._id}.${service.salon_id.image?.extension || "jpg"}`
        : null;
      delete service.salon_id.image;
    }

    res.status(200).json({ message: "Service fetched successfully", data: service });
  } catch (error) {
    console.error("Error fetching service:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ------------------- Update Service -------------------
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

    const updatedService = await Service.findOneAndUpdate(
      { _id: id, salon_id },
      updateData,
      { new: true }
    ).lean();

    if (!updatedService) {
      return res.status(404).json({ message: "Service not found" });
    }

    updatedService.image_url = updatedService.image?.data
      ? `/api/services/image/${updatedService._id}.${updatedService.image?.extension || "jpg"}`
      : null;
    delete updatedService.image;

    res.status(200).json({ message: "Service updated successfully", data: updatedService });
  } catch (error) {
    console.error("Error updating service:", error);
    res.status(500).json({ message: "Server error", error });
  }
});

// ------------------- Delete Service -------------------
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const deletedService = await Service.findOneAndDelete({ _id: id, salon_id });
    if (!deletedService) {
      return res.status(404).json({ message: "Service not found" });
    }
    res.status(200).json({ message: "Service deleted successfully" });
  } catch (error) {
    console.error("Error deleting service:", error);
    res.status(500).json({ message: "Server error", error });
  }
});

module.exports = router;