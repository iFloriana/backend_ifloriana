const express = require("express");
const ProductCategory = require("../models/ProductCategory");
const Branch = require("../models/Branch");
const Brand = require("../models/Brand");
const router = express.Router();
const mongoose = require("mongoose");
const getUploader = require("../middleware/imageUpload");
const upload = getUploader("productcategory_images");

// Create ProductCategory
router.post("/", upload.single("image"), async (req, res) => {
  const { branch_id, name, brand_id, status, salon_id } = req.body;
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

    // Validate brand existence
    const brand = await Brand.findOne({ _id: brand_id, salon_id });
    if (!brand) {
      return res.status(404).json({ message: "Brand not found" });
    }

    const newProductCategory = new ProductCategory({
      branch_id,
      image,
      name,
      brand_id,
      status,
      salon_id,
    });
    await newProductCategory.save();
    
    res.status(201).json({ message: "ProductCategory created successfully", data: newProductCategory });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Updated Route to get category names and IDs
router.get("/names", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const categories = await ProductCategory.find({ salon_id }).select("_id name");
    res.status(200).json({ data: categories });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get All ProductCategories
router.get("/", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const productCategories = await ProductCategory.find({ salon_id }).populate("branch_id").populate("brand_id");
    res.status(200).json({ message: "ProductCategories fetched successfully", data: productCategories });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});
 
// Get ProductCategories by Branch ID
router.get("/by-branch", async (req, res) => {
  const { salon_id, branch_id } = req.query;

  if (!salon_id || !branch_id) {
    return res.status(400).json({ message: "salon_id and branch_id are required" });
  }

  try {
    const productCategories = await ProductCategory.find({
      salon_id: new mongoose.Types.ObjectId(salon_id),
      branch_id: new mongoose.Types.ObjectId(branch_id)
    }).populate({
      path: "branch_id",
      match: { _id: new mongoose.Types.ObjectId(branch_id) },
      select: "_id name"
    }).populate("brand_id");

    const filteredProductCategories = productCategories.filter(category => category.branch_id && category.branch_id.length > 0);

    res.status(200).json({ message: "Product Categories fetched successfully", data: filteredProductCategories });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching product categories", error });
  }
});

// Get Single ProductCategory
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const productCategory = await ProductCategory.findOne({ _id: id, salon_id }).populate("branch_id").populate("brand_id");
    if (!productCategory) {
      return res.status(404).json({ message: "ProductCategory not found" });
    }
    res.status(200).json({ message: "ProductCategory fetched successfully", data: productCategory });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Update ProductCategory
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

    const updatedProductCategory = await ProductCategory.findOneAndUpdate({ _id: id, salon_id }, updateData, { new: true });
    
    if (!updatedProductCategory) {
      return res.status(404).json({ message: "ProductCategory not found" });
    }
    
    res.status(200).json({ message: "ProductCategory updated successfully", data: updatedProductCategory });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete ProductCategory
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const deletedProductCategory = await ProductCategory.findOneAndDelete({ _id: id, salon_id });
    if (!deletedProductCategory) {
      return res.status(404).json({ message: "ProductCategory not found" });
    }
    res.status(200).json({ message: "ProductCategory deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});


module.exports = router;