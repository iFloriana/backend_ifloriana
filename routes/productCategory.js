const express = require("express");
const ProductCategory = require("../models/ProductCategory");
const Branch = require("../models/Branch");
const Brand = require("../models/Brand");
const router = express.Router();
const mongoose = require("mongoose");
const getUploader = require("../middleware/imageUpload");
const upload = getUploader();
const path = require("path");

// ✅ Helper: transforms a product category document to remove base64 images
function transformProductCategory(category) {
  if (!category) return null;
  const obj = { ...category };

  // ✅ Fix product category image
  if (obj.image?.data) {
    obj.image_url = `/api/productCategories/image/${obj._id}.${obj.image.extension || "jpg"}`;
  } else {
    obj.image_url = null;
  }
  delete obj.image;

  // ✅ Fix brand images
  if (Array.isArray(obj.brand_id)) {
    obj.brand_id = obj.brand_id.map((brand) => {
      if (!brand) return brand;
      const brandObj = { ...brand };
      brandObj.image_url = brand.image?.data
        ? `/api/brands/image/${brand._id}.${brand.image.extension || "jpg"}`
        : null;
      delete brandObj.image;
      return brandObj;
    });
  } else if (obj.brand_id) {
    const brandObj = { ...obj.brand_id };
    brandObj.image_url = brandObj.image?.data
      ? `/api/brands/image/${brandObj._id}.${brandObj.image.extension || "jpg"}`
      : null;
    delete brandObj.image;
    obj.brand_id = brandObj;
  }

  // ✅ Fix branch images
  if (Array.isArray(obj.branch_id)) {
    obj.branch_id = obj.branch_id.map((branch) => {
      if (!branch) return branch;
      const branchObj = { ...branch };
      branchObj.image_url = branch.image?.data
        ? `/api/branches/image/${branch._id}.${branch.image.extension || "jpg"}`
        : null;
      delete branchObj.image;
      return branchObj;
    });
  } else if (obj.branch_id) {
    const branchObj = { ...obj.branch_id };
    branchObj.image_url = branchObj.image?.data
      ? `/api/branches/image/${branchObj._id}.${branchObj.image.extension || "jpg"}`
      : null;
    delete branchObj.image;
    obj.branch_id = branchObj;
  }

  return obj;
}

router.get("/image/:filename", async (req, res) => {
  try {
    const id = req.params.filename.split(".")[0];

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Product Category ID" });
    }

    const productCategory = await ProductCategory.findById(id);
    if (!productCategory?.image?.data) {
      return res.status(404).json({ message: "Image not found" });
    }

    const contentType = productCategory.image.contentType || "image/jpeg";
    res.type(contentType);
    res.set("Content-Disposition", "inline");
    res.send(Buffer.from(productCategory.image.data)); // ✅ fixed
  } catch (err) {
    console.error("Image fetch error: ", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Create ProductCategory
router.post("/", upload.single("image"), async (req, res) => {
  const { branch_id, name, brand_id, status, salon_id } = req.body;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    // Validate branch existence
    const branch = await Branch.findOne({ _id: branch_id, salon_id });
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

// GET: All ProductCategories
router.get("/", async (req, res) => {
  const { salon_id } = req.query;
  if (!salon_id) return res.status(400).json({ message: "salon_id is required" });

  try {
    const productCategories = await ProductCategory.find({ salon_id })
      .populate("branch_id")
      .populate("brand_id")
      .lean();

    const data = productCategories.map(transformProductCategory);

    res.status(200).json({ message: "ProductCategories fetched successfully", data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// GET: ProductCategories by branch
router.get("/by-branch", async (req, res) => {
  const { salon_id, branch_id } = req.query;
  if (!salon_id || !branch_id) {
    return res.status(400).json({ message: "salon_id and branch_id are required" });
  }

  try {
    const productCategories = await ProductCategory.find({
      salon_id: new mongoose.Types.ObjectId(salon_id),
      branch_id: new mongoose.Types.ObjectId(branch_id)
    })
      .populate({
        path: "branch_id",
        match: { _id: new mongoose.Types.ObjectId(branch_id) },
        select: "_id name image"
      })
      .populate("brand_id")
      .lean();

    const filtered = productCategories.filter(cat => cat.branch_id);
    const data = filtered.map(transformProductCategory);

    res.status(200).json({ message: "Product Categories fetched successfully", data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching product categories", error });
  }
});

// GET: Single ProductCategory
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.query;
  if (!salon_id) return res.status(400).json({ message: "salon_id is required" });

  try {
    const productCategory = await ProductCategory.findOne({ _id: id, salon_id })
      .populate("branch_id")
      .populate("brand_id")
      .lean();

    if (!productCategory) {
      return res.status(404).json({ message: "ProductCategory not found" });
    }

    const obj = transformProductCategory(productCategory);
    res.status(200).json({ message: "ProductCategory fetched successfully", data: obj });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Update ProductCategory
router.put("/:id", upload.single("image"), async (req, res) => {
  const { id } = req.params;
  const { salon_id, ...rest } = req.body;

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
        extension: req.file.originalname.split(".").pop()
      };
    }

    const updatedProductCategory = await ProductCategory.findOneAndUpdate({ _id: id, salon_id }, updateData, { new: true });

    if (!updatedProductCategory) {
      return res.status(404).json({ message: "ProductCategory not found" });
    }

    const obj = updatedProductCategory.toObject();
    obj.image_url = updatedProductCategory.image?.data
      ? `/api/productCategories/image/${updatedProductCategory._id}.${updatedProductCategory.image?.extension || "jpg"}`
      : null;
    delete obj.image;

    res.status(200).json({ message: "ProductCategory updated successfully", data: obj });
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