const express = require("express");
const Brand = require("../models/Brand");
const Branch = require("../models/Branch");
const router = express.Router();
const mongoose = require("mongoose");
const getUploader = require("../middleware/imageUpload");
const upload = getUploader("brand_images");

// Create Brand
router.post("/", upload.single("image"), async (req, res) => {
  const { branch_id, name, status, salon_id } = req.body;
  const image = req.file ? req.file.path.replace(/\\/g, '/') : null;

  try {
    // Validate branch existence
    const branch = await Branch.findById(branch_id);
    if (!branch) {
      return res.status(404).json({ message: "Branch not found" });
    }

    const newBrand = new Brand({
      branch_id,
      image,
      name,
      status,
      salon_id
    });

    await newBrand.save();

    res.status(201).json({ message: "Brand created successfully", data: newBrand });
  } catch (error) {
    console.error("Create brand error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Get All Brands
router.get("/", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
      return res.status(400).json({ message: 'salon_id is required' });
  }

  try {
    const brands = await Brand.find({ salon_id }).populate("branch_id");
    res.status(200).json({ message: "Brands fetched successfully", data: brands });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get Brands by Branch ID
router.get("/by-branch", async (req, res) => {
  const { salon_id, branch_id } = req.query;

  if (!salon_id || !branch_id) {
    return res.status(400).json({ message: "salon_id and branch_id are required" });
  }

  try {
    const brands = await Brand.find({ 
      salon_id: new mongoose.Types.ObjectId(salon_id),
      branch_id: new mongoose.Types.ObjectId(branch_id)
    }).populate({
      path: "branch_id",
      match: { _id: new mongoose.Types.ObjectId(branch_id) },
      select: "_id name"
    });

    const filteredBrands = brands.filter(brand => brand.branch_id && brand.branch_id.length > 0);

    res.status(200).json({ message: "Brands fetched successfully", data: filteredBrands });
  } catch (error) {
    console.error("Error fetching brands:", error);
    res.status(500).json({ message: "Error fetching brands", error });
  }
});

// Route to get brand names and IDs
router.get("/names", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const brands = await Brand.find({ salon_id }).select("_id name");
    res.status(200).json({ data: brands });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get Single Brand
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: 'salon_id is required' });
  }

  try {
    const brand = await Brand.findOne({ _id: id, salon_id }).populate('branch_id');
    if (!brand) {
      return res.status(404).json({ message: 'Brand not found' });
    }
    res.status(200).json({ message: 'Brand fetched successfully', data: brand });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update Brand
router.put('/:id', upload.single("image"), async (req, res) => {
  const { id } = req.params;
  const { salon_id, ...rest } = req.body;

  if (!salon_id) {
    return res.status(400).json({ message: 'salon_id is required' });
  }

  try {
    const updateData = { ...rest };

    if (req.file) {
      updateData.image = req.file.path.replace(/\\/g, "/");
    }

    const updatedBrand = await Brand.findOneAndUpdate(
      { _id: id, salon_id },
      updateData,
      { new: true }
    );

    if (!updatedBrand) {
      return res.status(404).json({ message: 'Brand not found' });
    }

    res.status(200).json({ message: 'Brand updated successfully', data: updatedBrand });
  } catch (error) {
    console.error("Update brand error:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete Brand
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: 'salon_id is required' });
  }

  try {
    const deletedBrand = await Brand.findOneAndDelete({ _id: id, salon_id });
    if (!deletedBrand) {
      return res.status(404).json({ message: 'Brand not found' });
    }
    res.status(200).json({ message: 'Brand deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;