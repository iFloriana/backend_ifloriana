const express = require("express");
const SubCategory = require("../models/SubCategory");
const Salon = require("../models/Salon");
const Category = require("../models/Category");
const mongoose = require("mongoose");
const router = express.Router();
const getUploader = require("../middleware/imageUpload");
const upload = getUploader();
const path = require("path");

// ------------------- Serve SubCategory Image -------------------
router.get("/image/:filename", async (req, res) => {
  try {
    const id = req.params.filename.split(".")[0];

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid SubCategory ID" });
    }

    const sub = await SubCategory.findById(id);
    if (!sub?.image?.data) {
      return res.status(404).json({ message: "Image not found" });
    }

    res.set("Content-Type", sub.image.contentType || "image/jpeg");
    res.set("Content-Disposition", "inline");
    res.send(Buffer.from(sub.image.data));
  } catch (error) {
    console.error("SubCategory image fetch error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Middleware to validate salon_id (should not run for image route)
const validateSalonId = async (req, res, next) => {
  const salon_id = req.query.salon_id || req.body.salon_id;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  if (!mongoose.Types.ObjectId.isValid(salon_id)) {
    return res.status(400).json({ message: "Invalid salon_id" });
  }

  try {
    const salonExists = await Salon.findById(salon_id);
    if (!salonExists) {
      return res.status(404).json({ message: "Salon not found" });
    }

    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

router.use(validateSalonId);

// ------------------- Create SubCategory -------------------
router.post("/", upload.single("image"), async (req, res) => {
  const { salon_id, category_id, name, status } = req.body;

  const image = req.file
    ? {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: req.file.originalname,
        extension: path.extname(req.file.originalname).slice(1),
      }
    : undefined;

  try {
    const newSubCategory = new SubCategory({
      salon_id,
      image,
      category_id,
      name,
      status,
    });

    await newSubCategory.save();

    const obj = newSubCategory.toObject();
    obj.image_url = image
      ? `/api/subcategories/image/${newSubCategory._id}.${image.extension || "jpg"}`
      : null;
    delete obj.image;

    res.status(201).json({ message: "SubCategory created successfully", data: obj });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// ------------------- Get All SubCategories -------------------
router.get("/", async (req, res) => {
  const { salon_id } = req.query;

  try {
    const subcategories = await SubCategory.find({ salon_id })
      .populate("salon_id")
      .populate("category_id")
      .lean();

    const enriched = subcategories.map((s) => {
      s.image_url = s.image?.data
        ? `/api/subcategories/image/${s._id}.${s.image?.extension || "jpg"}`
        : null;
      delete s.image;

      if (s.salon_id && typeof s.salon_id === "object") {
        delete s.salon_id.image;
      }

      if (s.category_id && typeof s.category_id === "object") {
        s.category_id.image_url = s.category_id.image?.data
          ? `/api/categories/image/${s.category_id._id}.${s.category_id.image?.extension || "jpg"}`
          : null;
        delete s.category_id.image;
      }

      return s;
    });

    res.status(200).json({ message: "SubCategories fetched successfully", data: enriched });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// ------------------- Get Single SubCategory -------------------
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.query;

  try {
    const s = await SubCategory.findOne({ _id: id, salon_id })
      .populate("salon_id")
      .populate("category_id")
      .lean();

    if (!s) {
      return res.status(404).json({ message: "SubCategory not found" });
    }

    s.image_url = s.image?.data
      ? `/api/subcategories/image/${s._id}.${s.image?.extension || "jpg"}`
      : null;
    delete s.image;

    if (s.salon_id && typeof s.salon_id === "object") {
      delete s.salon_id.image;
    }

    if (s.category_id && typeof s.category_id === "object") {
      s.category_id.image_url = s.category_id.image?.data
        ? `/api/categories/image/${s.category_id._id}.${s.category_id.image?.extension || "jpg"}`
        : null;
      delete s.category_id.image;
    }

    res.status(200).json({ message: "SubCategory fetched successfully", data: s });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// ------------------- Update SubCategory -------------------
router.put("/:id", upload.single("image"), async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.query;
  const updateData = { ...req.body };

  try {
    if (req.file) {
      updateData.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: req.file.originalname,
        extension: path.extname(req.file.originalname).slice(1),
      };
    }

    const updated = await SubCategory.findOneAndUpdate(
      { _id: id, salon_id },
      updateData,
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ message: "SubCategory not found" });
    }

    updated.image_url = updated.image?.data
      ? `/api/subcategories/image/${updated._id}.${updated.image?.extension || "jpg"}`
      : null;
    delete updated.image;

    res.status(200).json({ message: "SubCategory updated successfully", data: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// ------------------- Delete SubCategory -------------------
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.query;

  try {
    const deleted = await SubCategory.findOneAndDelete({ _id: id, salon_id });
    if (!deleted) {
      return res.status(404).json({ message: "SubCategory not found" });
    }
    res.status(200).json({ message: "SubCategory deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
