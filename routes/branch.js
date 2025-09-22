const express = require("express");
const Branch = require("../models/Branch");
const Staff = require("../models/Staff");
const router = express.Router();
const getUploader = require("../middleware/imageUpload");
const upload = getUploader();
const path = require("path");
const mongoose = require("mongoose");

// Helper to transform product, brand, category, and branch image fields
function transformProduct(product, req) {
  const obj = product.toObject();

  // Helper to handle any populated image field
  const handleImageField = (field, route) => {
    if (obj[field] && obj[field].image?.data) {
      obj[field].image_url = `${route}/${obj[field]._id}.${obj[field].image.extension || "jpg"}`;
      delete obj[field].image;
    }
  };

  // Product image
  obj.image_url = product.image?.data
    ? `/api/products/image/${product._id}.${product.image.extension || "jpg"}`
    : null;
  delete obj.image;

  // Brand image
  handleImageField("brand_id", "/api/brands/image");

  // Category image
  handleImageField("category_id", "/api/productCategories/image");

  // ✅ Salon image
  handleImageField("salon_id", "/api/salons/image");

  return obj;
}

// ------------------- POST: Create Branch -------------------
router.post("/", upload.single("image"), async (req, res) => {
  const { salon_id } = req.body;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const branchData = { ...req.body };

    if (req.file) {
      branchData.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: req.file.originalname,
        extension: path.extname(req.file.originalname).slice(1),
      };
    }

    const newBranch = new Branch(branchData);
    await newBranch.save();

    res.status(201).json({
      message: "Branch created successfully",
      data: newBranch,
    });
  } catch (error) {
    console.error("Create branch error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ------------------- GET: Branch Names -------------------
router.get("/names", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const branchNames = await Branch.find({ salon_id }, { name: 1 });
    res.status(200).json({
      message: "Branch names and IDs fetched successfully",
      data: branchNames,
    });
  } catch (error) {
    console.error("Fetch branch names error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ------------------- GET: All Branches -------------------
router.get("/", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const branches = await Branch.find({ salon_id })
      .populate("salon_id")
      .populate({
        path: "service_id",
        populate: {
          path: "category_id",
          select: "_id name",
        },
      });

    const staffCounts = await Staff.aggregate([
      {
        $group: {
          _id: "$branch_id",
          count: { $sum: 1 },
        },
      },
    ]);

    const countMap = {};
    staffCounts.forEach(({ _id, count }) => {
      if (_id) countMap[_id.toString()] = count;
    });

    const branchData = branches.map((branch) => {
      const obj = branch.toObject();
      obj.staff_count = countMap[branch._id.toString()] || 0;

      // ✅ Keep branch image
      if (branch.image?.data) {
        obj.image_url = `/api/branches/image/${branch._id}.${branch.image.extension || "jpg"}`;
      }
      delete obj.image;

      // ❌ Remove salon image
      if (obj.salon_id && obj.salon_id.image) {
        delete obj.salon_id.image;
      }

      // ❌ Remove service images
      if (Array.isArray(obj.service_id)) {
        obj.service_id = obj.service_id.map((service) => {
          if (service?.image) delete service.image;
          return service;
        });
      }

      return obj;
    });

    res.status(200).json({
      message: "Branches fetched successfully",
      data: branchData,
    });
  } catch (error) {
    console.error("Fetch branches error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ------------------- GET: Single Branch -------------------
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const branch = await Branch.findById(id)
      .populate("salon_id")
      .populate("service_id");

    if (!branch) {
      return res.status(404).json({ message: "Branch not found" });
    }

    const staffCount = await Staff.countDocuments({ branch_id: id });

    const obj = branch.toObject();

    // ✅ Keep branch image
    if (branch.image?.data) {
      obj.image_url = `/api/branches/image/${branch._id}.${branch.image.extension || "jpg"}`;
    }
    delete obj.image;

    // ❌ Remove salon image
    if (obj.salon_id && obj.salon_id.image) {
      delete obj.salon_id.image;
    }

    // ❌ Remove service images
    if (Array.isArray(obj.service_id)) {
      obj.service_id = obj.service_id.map((service) => {
        if (service?.image) delete service.image;
        return service;
      });
    }

    res.status(200).json({
      message: "Branch fetched successfully",
      data: {
        ...obj,
        staff_count: staffCount,
      },
    });
  } catch (error) {
    console.error("Fetch branch error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ------------------- PUT: Update Branch -------------------
router.put("/:id", upload.single("image"), async (req, res) => {
  try {
    const updateData = { ...req.body };

    if (req.file) {
      updateData.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: req.file.originalname,
        extension: path.extname(req.file.originalname).slice(1),
      };
    }

    const updatedBranch = await Branch.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
    });

    if (!updatedBranch) {
      return res.status(404).json({ message: "Branch not found" });
    }

    res.json({ message: "Branch updated", data: updatedBranch });
  } catch (error) {
    console.error("Update branch error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ------------------- GET: Branch Image (preview inline) -------------------
router.get("/image/:filename", async (req, res) => {
  try {
    const id = req.params.filename.split(".")[0];

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid branch ID" });
    }

    const branch = await Branch.findById(id);

    if (!branch || !branch.image?.data) {
      return res.status(404).json({ message: "Image not found" });
    }

    const contentType = branch.image.contentType || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", "inline");

    const buffer = Buffer.isBuffer(branch.image.data)
      ? branch.image.data
      : Buffer.from(branch.image.data);

    res.send(buffer);
  } catch (error) {
    console.error("Image fetch error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ------------------- DELETE: Branch -------------------
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const deletedBranch = await Branch.findByIdAndDelete(id);

    if (!deletedBranch) {
      return res.status(404).json({ message: "Branch not found" });
    }

    res.status(200).json({ message: "Branch deleted successfully" });
  } catch (error) {
    console.error("Delete branch error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;