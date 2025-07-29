const express = require("express");
const ProductSubCategory = require("../models/ProductSubCategory");
const Branch = require("../models/Branch");
const ProductCategory = require("../models/ProductCategory");
const Brand = require("../models/Brand");
const router = express.Router();
const mongoose = require("mongoose");
const getUploader = require("../middleware/imageUpload");
const upload = getUploader("productsubcategory_images");

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Create ProductSubCategory    
router.post("/", upload.single("image"), async (req, res) => {
  const { branch_id, product_category_id, brand_id, name, status, salon_id } = req.body;
  const image = req.file ? req.file.path.replace(/\\/g, '/'): null;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    // Validate branch existence
    const branch = await Branch.findOne({ _id: branch_id, salon_id });
    if (!branch) {
      return res.status(404).json({ message: "Branch not found" });
    }

    // Validate product category existence
    const productCategory = await ProductCategory.findOne({ _id: product_category_id, salon_id });
    if (!productCategory) {
      return res.status(404).json({ message: "Product Category not found" });
    }

    // Validate brand existence
    const brand = await Brand.findOne({ _id: brand_id, salon_id });
    if (!brand) {
      return res.status(404).json({ message: "Brand not found" });
    }

    const newProductSubCategory = new ProductSubCategory({
      branch_id,
      image,
      product_category_id,
      brand_id,
      name,
      status,
      salon_id,
    });
    await newProductSubCategory.save();

    res.status(201).json({ message: "ProductSubCategory created successfully", data: newProductSubCategory });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get All ProductSubCategories
router.get("/", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const productSubCategories = await ProductSubCategory.find({ salon_id })
      .populate("branch_id")
      .populate("product_category_id")
      .populate("brand_id");
    res.status(200).json({ message: "ProductSubCategories fetched successfully", data: productSubCategories });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// get product sub categories by branch_id
router.get("/by-branch", async (req, res) => {
  const { salon_id, branch_id } = req.query;

  if (!salon_id || !branch_id) {
    return res.status(400).json({ message: "branch_id and salon_id are required" });
  }

  if (!isValidObjectId(salon_id) || !isValidObjectId(branch_id)) {
    return res.status(400).json({ message: "Invalid ObjectId in query parameters" });
  }

  try {
    const productSubCategories = await ProductSubCategory.find({
      salon_id: new mongoose.Types.ObjectId(salon_id),
      branch_id: new mongoose.Types.ObjectId(branch_id)
    })
      .populate({
        path: "branch_id",
        match: { _id: new mongoose.Types.ObjectId(branch_id) },
        select: "_id name"
      })
      .populate("product_category_id")
      .populate("brand_id");

    const filteredProductSubCategories = productSubCategories.filter(
      sub => sub.branch_id && sub.branch_id.length > 0
    );

    return res.status(200).json({
      message: "Product Sub-Categories fetched successfully",
      data: filteredProductSubCategories
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Error fetching product sub-categories",
      error: error.message
    });
  }
});

// Get Single ProductSubCategory
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const productSubCategory = await ProductSubCategory.findOne({ _id: id, salon_id })
      .populate("branch_id")
      .populate("product_category_id")
      .populate("brand_id");
    if (!productSubCategory) {
      return res.status(404).json({ message: "ProductSubCategory not found" });
    }
    res.status(200).json({ message: "ProductSubCategory fetched successfully", data: productSubCategory });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Update ProductSubCategory
router.put("/:id", upload.single("image"), async (req, res) => {
  const { id } = req.params;
  const { salon_id, ...updateData } = req.body;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    if(req.file) {
      updateData.image = req.file.path.replace(/\\/g, '/');
    }

    const updatedProductSubCategory = await ProductSubCategory.findOneAndUpdate({ _id: id, salon_id }, updateData, { new: true });
    if (!updatedProductSubCategory) {
      return res.status(404).json({ message: "ProductSubCategory not found" });
    }
    res.status(200).json({ message: "ProductSubCategory updated successfully", data: updatedProductSubCategory });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete ProductSubCategory
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const deletedProductSubCategory = await ProductSubCategory.findOneAndDelete({ _id: id, salon_id });
    if (!deletedProductSubCategory) {
      return res.status(404).json({ message: "ProductSubCategory not found" });
    }
    res.status(200).json({ message: "ProductSubCategory deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;