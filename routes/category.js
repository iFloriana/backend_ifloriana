const express = require("express");
const Category = require("../models/Category");
const router = express.Router();
const mongoose = require("mongoose");
const getUploader = require("../middleware/imageUpload");
const upload = getUploader();
const path = require("path");

// ------------------- POST: Create Category -------------------
router.post("/", upload.single("image"), async (req, res) => {
  const { salon_id, name, status } = req.body;

  if (!salon_id || !name) {
    return res.status(400).json({ message: "salon_id and name are required" });
  }

  try {
    const image = req.file
      ? {
          data: req.file.buffer,
          contentType: req.file.mimetype,
          originalName: req.file.originalname,
          extension: path.extname(req.file.originalname).slice(1)
        }
      : undefined;

    const newCategory = new Category({
      salon_id,
      name,
      status,
      image
    });

    await newCategory.save();

    res.status(201).json({
      message: "Category created successfully",
      data: newCategory
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ------------------- GET: All Categories -------------------
router.get("/", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const categories = await Category.find({ salon_id }).populate("salon_id");

    const data = categories.map((category) => {
      const obj = category.toObject();
      obj.image_url = category.image?.data
        ? `/api/categories/image/${category._id}.${category.image.extension || "jpg"}`
        : null;
      delete obj.image;
      return obj;
    });

    res.status(200).json({ message: "Categories fetched successfully", data });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ------------------- GET: Category Names & IDs -------------------
router.get("/names", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const categoryNamesAndIds = await Category.find({ salon_id }, { name: 1 });
    res.status(200).json({
      message: "Category names and IDs fetched successfully",
      data: categoryNamesAndIds
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ------------------- GET: Single Category -------------------
router.get("/:id", async (req, res) => {
  try {
    const category = await Category.findById(req.params.id).populate("salon_id");

    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    const obj = category.toObject();
    obj.image_url = category.image?.data
      ? `/api/categories/image/${category._id}.${category.image.extension || "jpg"}`
      : null;
    delete obj.image;

    res.status(200).json({
      message: "Category fetched successfully",
      data: obj
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ------------------- PUT: Update Category -------------------
router.put("/:id", upload.single("image"), async (req, res) => {
  try {
    const updateData = { ...req.body };

    if (req.file) {
      updateData.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: req.file.originalname,
        extension: path.extname(req.file.originalname).slice(1)
      };
    }

    const updatedCategory = await Category.findByIdAndUpdate(req.params.id, updateData, {
      new: true
    });

    if (!updatedCategory) {
      return res.status(404).json({ message: "Category not found" });
    }

    const obj = updatedCategory.toObject();
    obj.image_url = updatedCategory.image?.data
      ? `/api/categories/image/${updatedCategory._id}.${updatedCategory.image.extension || "jpg"}`
      : null;
    delete obj.image;

    res.status(200).json({
      message: "Category updated successfully",
      data: obj
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ------------------- GET: Serve Image Preview -------------------
router.get("/image/:filename", async (req, res) => {
  try {
    const id = req.params.filename.split(".")[0];

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid category ID" });
    }

    const category = await Category.findById(id);

    if (!category || !category.image?.data) {
      return res.status(404).json({ message: "Image not found" });
    }

    const contentType = category.image.contentType || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", "inline");

    const buffer = Buffer.isBuffer(category.image.data)
      ? category.image.data
      : Buffer.from(category.image.data);

    res.send(buffer);
  } catch (error) {
    console.error("Image fetch error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ------------------- DELETE: Category -------------------
router.delete("/:id", async (req, res) => {
  try {
    const deletedCategory = await Category.findByIdAndDelete(req.params.id);
    if (!deletedCategory) {
      return res.status(404).json({ message: "Category not found" });
    }

    res.status(200).json({ message: "Category deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;