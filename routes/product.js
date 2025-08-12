const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const Variation = require("../models/Variation");
const mongoose = require("mongoose");
const getUploader = require("../middleware/imageUpload");
const upload = getUploader();
const path = require("path");

// Validate variation structure
async function validateProductVariations(variationsInput) {
  for (const variationEntry of variationsInput) {
    const variationDoc = await Variation.findById(variationEntry.variation_id);
    if (!variationDoc) {
      throw new Error(`Variation ID ${variationEntry.variation_id} not found`);
    }
    const allValuesValid = variationEntry.value_names.every(value => variationDoc.value.includes(value));
    if (!allValuesValid) {
      throw new Error(`Invalid variation values for "${variationDoc.name}"`);
    }
  }
}

// Helper to transform product, brand, and category image fields
function transformProduct(product, req) {
  const obj = product.toObject();

  // Helper to handle any populated image field (supports array or single object)
  const handleImageField = (field, route) => {
    if (Array.isArray(obj[field])) {
      obj[field] = obj[field].map(item => {
        if (item?.image?.data) {
          return {
            ...item,
            image_url: `${route}/${item._id}.${item.image.extension || "jpg"}`,
          };
        }
        return item;
      }).map(({ image, ...rest }) => rest); // remove image field
    } else if (obj[field]?.image?.data) {
      obj[field].image_url = `${route}/${obj[field]._id}.${obj[field].image.extension || "jpg"}`;
      delete obj[field].image;
    }
  };

  // Product image
  obj.image_url = product.image?.data
    ? `/api/products/image/${product._id}.${product.image.extension || "jpg"}`
    : null;

  // Populated references
  handleImageField("branch_id", "/api/branches/image");
  handleImageField("brand_id", "/api/brands/image");
  handleImageField("category_id", "/api/productCategories/image");
  handleImageField("tag_id", "/api/tags/image");
  handleImageField("unit_id", "/api/units/image");

  return obj;
}

// GET: Serve Image Preview
router.get("/image/:filename", async (req, res) => {
  try {
    const id = req.params.filename.split(".")[0];

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Product ID" });
    }

    const product = await Product.findById(id);
    if (!product || !product.image?.data) {
      return res.status(404).json({ message: "Image not found" });
    }

    const contentType = product.image.contentType || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", "inline");

    const buffer = Buffer.isBuffer(product.image.data)
      ? product.image.data
      : Buffer.from(product.image.data);

    res.send(buffer);
  } catch (error) {
    console.error("Image fetch error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// POST: Create product
router.post("/", upload.single("image"), async (req, res) => {
  try {
    const productData = { ...req.body };

    // Parse branch_id if stringified
    if (productData.branch_id && typeof productData.branch_id === "string") {
      try {
        productData.branch_id = JSON.parse(productData.branch_id);
      } catch {
        return res.status(400).json({ message: "branch_id must be a valid JSON array" });
      }
    }

    // Parse variation_id if stringified
    if (productData.variation_id && typeof productData.variation_id === "string") {
      try {
        productData.variation_id = JSON.parse(productData.variation_id);
      } catch {
        return res.status(400).json({ message: "variation_id must be a valid JSON array" });
      }
    }

    // Parse variants if stringified
    if (productData.variants && typeof productData.variants === "string") {
      try {
        productData.variants = JSON.parse(productData.variants);
      } catch {
        return res.status(400).json({ message: "variants must be a valid JSON array of objects" });
      }
    }

    // Handle image upload
    if (req.file) {
      productData.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: req.file.originalname,
        extension: path.extname(req.file.originalname).slice(1),
      };
    }

    // Type conversions
    productData.has_variations =
      productData.has_variations === "1" ||
      productData.has_variations === 1 ||
      productData.has_variations === true;

    if (productData.price) productData.price = Number(productData.price);
    if (productData.stock) productData.stock = Number(productData.stock);
    if (productData.status) productData.status = Number(productData.status);

    // Save product
    const newProduct = new Product(productData);
    await newProduct.save();

    res.status(201).json({
      message: "Product created successfully",
      product: newProduct.toObject(),
    });

  } catch (error) {
    res.status(500).json({
      message: "Error creating product",
      error: error.message
    });
  }
});

// GET: All products
router.get("/", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const products = await Product.find({ salon_id })
      .populate("branch_id brand_id category_id tag_id unit_id variation_id");

    const data = products.map(p => transformProduct(p, req));

    res.status(200).json({ message: "Products fetched successfully", data });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ message: "Error fetching products", error });
  }
});

// GET: Product names
router.get("/names", async (req, res) => {
  try {
    const { salon_id } = req.query;
    if (!salon_id) return res.status(400).json({ message: "salon_id is required" });

    const products = await Product.find({ salon_id }, { _id: 1, product_name: 1 });
    const result = products.map(p => ({ id: p._id, name: p.product_name }));

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: "Error fetching product names", error: error.message });
  }
});

// GET: Products by branch
router.get("/by-branch", async (req, res) => {
  const { salon_id, branch_id } = req.query;

  if (!salon_id || !branch_id) {
    return res.status(400).json({ message: "salon_id and branch_id are required" });
  }

  try {
    const products = await Product.find({ salon_id, branch_id })
      .populate("branch_id brand_id category_id tag_id unit_id variation_id");

    const filteredProducts = products.filter(p => p.branch_id);
    const data = filteredProducts.map(p => transformProduct(p, req));

    res.status(200).json({ message: "Products fetched successfully", data });
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).json({ message: "Error fetching products", error });
  }
});

// GET: Single product
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("branch_id brand_id category_id tag_id unit_id variation_id");

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const obj = transformProduct(product, req);

    res.status(200).json({ message: "Product fetched successfully", data: obj });
  } catch (error) {
    res.status(500).json({ message: "Error fetching product", error });
  }
});

// PUT: Update product
router.put("/:id", upload.single("image"), async (req, res) => {

  try {
    const updateData = { ...req.body };

    // Parse variation_id
    if (typeof updateData.variation_id === "string") {
      try {
        updateData.variation_id = JSON.parse(updateData.variation_id);
      } catch (e) {
        return res.status(400).json({ message: "Invalid variation_id format" });
      }
    }

    // Parse variants
    if (updateData.has_variations && typeof updateData.variants === "string") {
      try {
        updateData.variants = JSON.parse(updateData.variants);
      } catch (e) {
        return res.status(400).json({ message: "Invalid variants format" });
      }
    }

    // ✅ Handle uploaded image
    if (req.file) {
      updateData.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: req.file.originalname,
        extension: path.extname(req.file.originalname).slice(1)
      };
    }

    const updatedProduct = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!updatedProduct) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.status(200).json({ message: "Product updated successfully", product: updatedProduct });

  } catch (error) {
    res.status(500).json({ message: "Error updating product", error: error.message });
  }
});

// Delete product
router.delete("/:id", async (req, res) => {
  try {
    const deletedProduct = await Product.findByIdAndDelete(req.params.id);
    if (!deletedProduct) return res.status(404).json({ message: "Product not found" });

    res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting product", error });
  }
});

// Update stock
router.patch("/:id/stock", async (req, res) => {
  try {
    const { stock, variant_sku, variant_stock } = req.body;
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    if (typeof stock !== "undefined") {
      product.stock = Number(stock);
    }

    if (variant_sku && typeof variant_stock !== "undefined") {
      const variant = product.variants.find(v => v.sku === variant_sku);
      if (!variant) return res.status(404).json({ message: "Variant not found" });
      variant.stock = Number(variant_stock);
    }

    await product.save();
    res.status(200).json({ message: "Stock updated successfully", product });
  } catch (error) {
    res.status(500).json({ message: "Error updating stock", error: error.message });
  }
});

module.exports = router;