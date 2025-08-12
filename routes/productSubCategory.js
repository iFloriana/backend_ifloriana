const express = require("express");
const ProductSubCategory = require("../models/ProductSubCategory");
const Branch = require("../models/Branch");
const ProductCategory = require("../models/ProductCategory");
const Brand = require("../models/Brand");
const router = express.Router();
const mongoose = require("mongoose");
const getUploader = require("../middleware/imageUpload");
const upload = getUploader();
const path = require("path");

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// ✅ Helper: format Brand with image URL
function formatBrandWithImageURL(brand) {
  if (!brand || typeof brand !== "object") return brand;
  const b = brand.toObject ? brand.toObject() : brand;

  return {
    ...b,
    image_url: b.image?.data
      ? `/api/brands/image/${b._id}.${b.image.extension || "jpg"}`
      : null,
    image: undefined,
  };
}

// ✅ Helper: format Product Category with image URL
function formatCategoryWithImageURL(category) {
  if (!category || typeof category !== "object") return category;
  const c = category.toObject ? category.toObject() : category;

  return {
    ...c,
    image_url: c.image?.data
      ? `/api/productCategories/image/${c._id}.${c.image.extension || "jpg"}`
      : null,
    image: undefined,
  };
}

router.get("/image/:filename", async (req, res) => {
  try {
    const id = req.params.filename.split(".")[0];

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Product Sub Category ID" });
    }

    const productSubCategory = await ProductSubCategory.findById(id);
    if (!productSubCategory?.image?.data) {
      return res.status(404).json({ message: "Image not found" });
    }

    const contentType = productSubCategory.image.contentType || "image/jpeg";
    res.type(contentType);
    res.set("Content-Disposition", "inline");
    res.send(Buffer.from(productSubCategory.image.data));
  } catch (err) {
    console.error("Image fetch error: ", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Create ProductSubCategory    
router.post("/", upload.single("image"), async (req, res) => {
  const { branch_id, product_category_id, brand_id, name, status, salon_id } = req.body;

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

    const image = req.file
      ? {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: req.file.originalname,
        extension: path.extname(req.file.originalname).slice(1)
      }
      : undefined;

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

// ----------------------
// GET: All ProductSubCategories
// ----------------------
router.get("/", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const productSubCategories = await ProductSubCategory.find({ salon_id })
      .populate("branch_id")
      .populate("product_category_id")
      .populate("brand_id")
      .lean();

    const data = productSubCategories.map((psc) => {
      const image_url = psc.image?.data
        ? `/api/productSubCategories/image/${psc._id}.${psc.image.extension || "jpg"}`
        : null;

      return {
        ...psc,
        image_url,
        brand_id: psc.brand_id
          ? Array.isArray(psc.brand_id)
            ? psc.brand_id.map(formatBrandWithImageURL)
            : formatBrandWithImageURL(psc.brand_id)
          : null,
        product_category_id: psc.product_category_id
          ? Array.isArray(psc.product_category_id)
            ? psc.product_category_id.map(formatCategoryWithImageURL)
            : formatCategoryWithImageURL(psc.product_category_id)
          : null,
        image: undefined, // remove raw buffer
      };
    });

    res.status(200).json({ message: "ProductSubCategories fetched successfully", data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// ----------------------
// GET: ProductSubCategories by Branch
// ----------------------
router.get("/by-branch", async (req, res) => {
  const { salon_id, branch_id } = req.query;

  if (!salon_id || !branch_id) {
    return res.status(400).json({ message: "branch_id and salon_id are required" });
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
      .populate("brand_id")
      .lean();

    const filtered = productSubCategories.filter(sub => sub.branch_id);

    const data = filtered.map((psc) => {
      const image_url = psc.image?.data
        ? `/api/productSubCategories/image/${psc._id}.${psc.image.extension || "jpg"}`
        : null;

      return {
        ...psc,
        image_url,
        brand_id: psc.brand_id
          ? Array.isArray(psc.brand_id)
            ? psc.brand_id.map(formatBrandWithImageURL)
            : formatBrandWithImageURL(psc.brand_id)
          : null,
        product_category_id: psc.product_category_id
          ? Array.isArray(psc.product_category_id)
            ? psc.product_category_id.map(formatCategoryWithImageURL)
            : formatCategoryWithImageURL(psc.product_category_id)
          : null,
        image: undefined,
      };
    });

    res.status(200).json({ message: "Product Sub-Categories fetched successfully", data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching product sub-categories", error });
  }
});

// ----------------------
// GET: Single ProductSubCategory
// ----------------------
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

    const obj = productSubCategory.toObject();
    obj.image_url = productSubCategory.image?.data
      ? `/api/productSubCategories/image/${productSubCategory._id}.${productSubCategory.image.extension || "jpg"}`
      : null;

    obj.brand_id = obj.brand_id
      ? Array.isArray(obj.brand_id)
        ? obj.brand_id.map(formatBrandWithImageURL)
        : formatBrandWithImageURL(obj.brand_id)
      : null;

    obj.product_category_id = obj.product_category_id
      ? Array.isArray(obj.product_category_id)
        ? obj.product_category_id.map(formatCategoryWithImageURL)
        : formatCategoryWithImageURL(obj.product_category_id)
      : null;

    delete obj.image;

    res.status(200).json({ message: "ProductSubCategory fetched successfully", data: obj });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Update ProductSubCategory
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

    const updatedProductSubCategory = await ProductSubCategory.findOneAndUpdate(
      { _id: id, salon_id },
      updateData,
      { new: true }
    );

    if (!updatedProductSubCategory) {
      return res.status(404).json({ message: "ProductSubCategory not found" });
    }

    const obj = updatedProductSubCategory.toObject();
    obj.image_url = updatedProductSubCategory.image?.data
      ? `/api/productSubCategories/image/${updatedProductSubCategory._id}.${updatedProductSubCategory.image?.extension || "jpg"}`
      : null;
    delete obj.image;

    res.status(200).json({ message: "ProductSubCategory updated successfully", data: obj });
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