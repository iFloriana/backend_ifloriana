const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Brand = require("../models/Brand");
const Branch = require("../models/Branch");
const getUploader = require("../middleware/imageUpload");
const upload = getUploader(); // Use default multer config
const path = require("path");

// ✅ Create Brand
router.post("/", upload.single("image"), async (req, res) => {
  const { branch_id, name, status, salon_id } = req.body;

  try {
    const branch = await Branch.findById(branch_id);
    if (!branch) {
      return res.status(404).json({ message: "Branch not found" });
    }

    const image = req.file
      ? {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: req.file.originalname,
        extension: path.extname(req.file.originalname).slice(1)
      }
      : undefined;

    const newBrand = new Brand({
      branch_id,
      name,
      status,
      salon_id,
      image
    });

    await newBrand.save();
    res.status(201).json({ message: "Brand created successfully", data: newBrand });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Get All Brands by salon_id
router.get("/", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const brands = await Brand.find({ salon_id }).populate("branch_id");

    const data = brands.map((brand) => {
      const obj = brand.toObject();
      obj.image_url = brand.image?.data
        ? `/api/brands/image/${brand._id}.${brand.image.extension || "jpg"}`
        : null;
      delete obj.image;
      return obj;
    });

    res.status(200).json({ message: "Brands fetched successfully", data });
  } catch (error) {
    console.error("Get all brands error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ Get Brands by Branch ID
router.get("/by-branch", async (req, res) => {
  const { salon_id, branch_id } = req.query;

  if (!salon_id || !branch_id) {
    return res.status(400).json({ message: "salon_id and branch_id are required" });
  }

  try {
    const brands = await Brand.find({
      salon_id: new mongoose.Types.ObjectId(salon_id),
      branch_id: new mongoose.Types.ObjectId(branch_id)
    }).populate("branch_id", "_id name");

    const formattedBrands = brands.map((brand) => {
      const obj = brand.toObject();
      obj.image_url = brand.image?.data
        ? `/api/brands/image/${brand._id}.${brand.image.extension || "jpg"}`
        : null;
      delete obj.image;
      return obj;
    });

    res.status(200).json({ message: "Brands fetched successfully", data: formattedBrands });
  } catch (error) {
    console.error("Error fetching brands:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ Get Brand Names
router.get("/names", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const brands = await Brand.find({ salon_id }).select("_id name");
    res.status(200).json({ data: brands });
  } catch (error) {
    console.error("Get brand names error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

router.get("/image/:filename", async (req, res) => {
  try {
    const id = req.params.filename.split(".")[0];

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid brand ID" });
    }

    const brand = await Brand.findById(id);
    if (!brand?.image?.data) {
      return res.status(404).json({ message: "Image not found" });
    }

    const contentType = brand.image.contentType || "image/jpeg";
    res.type(contentType); // 👈 sets Content-Type properly
    res.set("Content-Disposition", "inline"); // 👈 force preview, no download

    res.send(Buffer.from(brand.image.data));
  } catch (err) {
    console.error("Image fetch error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ Get Single Brand by ID
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const brand = await Brand.findOne({ _id: id, salon_id }).populate("branch_id");

    if (!brand) {
      return res.status(404).json({ message: "Brand not found" });
    }

    const obj = brand.toObject();
    obj.image_url = brand.image?.data
      ? `/api/brands/image/${brand._id}.${brand.image.extension || "jpg"}`
      : null;
    delete obj.image;

    res.status(200).json({ message: "Brand fetched successfully", data: obj });
  } catch (error) {
    console.error("Get single brand error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ Update Brand
router.put("/:id", upload.single("image"), async (req, res) => {
  const { id } = req.params;
  const { salon_id, ...rest } = req.body; // ✅ FIXED

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const updateData = { ...rest };

    if (req.file) {
      updateData.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: req.file.originalname,
        extension: req.file.originalname.split(".").pop(),
      };
    }

    const updatedBrand = await Brand.findOneAndUpdate(
      { _id: id, salon_id },
      updateData,
      { new: true }
    );

    if (!updatedBrand) {
      return res.status(404).json({ message: "Brand not found" });
    }

    const obj = updatedBrand.toObject();
    obj.image_url = updatedBrand.image?.data
      ? `/api/brands/image/${updatedBrand._id}.${updatedBrand.image?.extension || "jpg"}`
      : null;
    delete obj.image;

    res.status(200).json({ message: "Brand updated successfully", data: obj });
  } catch (error) {
    console.error("Update brand error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ✅ Delete Brand
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const deletedBrand = await Brand.findOneAndDelete({ _id: id, salon_id });

    if (!deletedBrand) {
      return res.status(404).json({ message: "Brand not found" });
    }

    res.status(200).json({ message: "Brand deleted successfully" });
  } catch (error) {
    console.error("Delete brand error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;