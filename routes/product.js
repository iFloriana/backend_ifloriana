const express = require("express");
const router = express.Router();
const Product = require("../models/Product");
const Variation = require("../models/Variation");
const mongoose = require("mongoose");
const getUploader = require("../middleware/imageUpload");
const upload = getUploader();
const path = require("path");
const StockHistory = require("../models/StockHistory");

// ✅ Validate variation structure
async function validateProductVariations(variationsInput) {
  for (const variationEntry of variationsInput) {
    const variationDoc = await Variation.findById(variationEntry.variation_id);
    if (!variationDoc) {
      throw new Error(`Variation ID ${variationEntry.variation_id} not found`);
    }
    const allValuesValid = variationEntry.value_names.every(value =>
      variationDoc.value.includes(value)
    );
    if (!allValuesValid) {
      throw new Error(`Invalid variation values for "${variationDoc.name}"`);
    }
  }
}

// ✅ Helper: transforms product + populated refs to replace buffer with image_url
function transformProduct(product, req) {
  const obj = product.toObject();

  // Product image
  obj.image_url = obj.image?.data
    ? `/api/products/image/${obj._id}.${obj.image.extension || "jpg"}`
    : null;
  delete obj.image;

  // Generic handler for populated refs
  const handleImageField = (field, route) => {
    if (Array.isArray(obj[field])) {
      obj[field] = obj[field].map(item => {
        if (item?.image?.data) {
          return {
            ...item,
            image_url: `${route}/${item._id}.${item.image.extension || "jpg"}`
          };
        }
        return item;
      }).map(({ image, ...rest }) => rest);
    } else if (obj[field]?.image?.data) {
      obj[field].image_url = `${route}/${obj[field]._id}.${obj[field].image.extension || "jpg"}`;
      delete obj[field].image;
    }
  };

  handleImageField("branch_id", "/api/branches/image");
  handleImageField("brand_id", "/api/brands/image");
  handleImageField("category_id", "/api/productCategories/image");
  handleImageField("tag_id", "/api/tags/image");
  handleImageField("unit_id", "/api/units/image");

  return obj;
}

// 🔹 Helper to format images
function formatImage(doc, type) {
  if (!doc) return doc;
  const obj = doc.toObject ? doc.toObject() : { ...doc };

  if (obj.image?.data) {
    const ext = obj.image.extension || "jpg";
    obj.image_url = `/api/${type}/image/${obj._id}.${ext}`;
  } else {
    obj.image_url = null;
  }

  delete obj.image; // ✅ remove raw buffer
  return obj;
}

// ✅ Serve product image
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

// ✅ Create product
router.post("/", upload.single("image"), async (req, res) => {
  try {
    const productData = { ...req.body };

    // Parse JSON fields
    ["branch_id", "variation_id", "variants"].forEach(field => {
      if (productData[field] && typeof productData[field] === "string") {
        try {
          productData[field] = JSON.parse(productData[field]);
        } catch {
          return res.status(400).json({ message: `${field} must be valid JSON` });
        }
      }
    });

    // Handle image
    if (req.file) {
      productData.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: req.file.originalname,
        extension: path.extname(req.file.originalname).slice(1)
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

    const newProduct = new Product(productData);
    await newProduct.save();

    res.status(201).json({
      message: "Product created successfully",
      product: transformProduct(newProduct, req)
    });
  } catch (error) {
    res.status(500).json({ message: "Error creating product", error: error.message });
  }
});

// ✅ Get all products
router.get("/", async (req, res) => {
  const { salon_id } = req.query;
  if (!salon_id) return res.status(400).json({ message: "salon_id is required" });

  try {
    const products = await Product.find({ salon_id })
      .populate("branch_id brand_id category_id tag_id unit_id variation_id");

    res.status(200).json({
      message: "Products fetched successfully",
      data: products.map(p => transformProduct(p, req))
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching products", error: error.message });
  }
});

// ✅ Get product names only
router.get("/names", async (req, res) => {
  try {
    const { salon_id } = req.query;
    if (!salon_id) return res.status(400).json({ message: "salon_id is required" });

    const products = await Product.find({ salon_id }, { _id: 1, product_name: 1 });
    res.status(200).json(products.map(p => ({ id: p._id, name: p.product_name })));
  } catch (error) {
    res.status(500).json({ message: "Error fetching product names", error: error.message });
  }
});

// ✅ Get stock history
router.get("/stock-history/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const history = await StockHistory.find({ product_id: id })
      .sort({ createdAt: -1 })
      .select("product_name quantity_received date");

    if (!history.length) {
      return res.status(404).json({ message: "No stock history found" });
    }

    // Format date (YYYY-MM-DD) only
    const formattedHistory = history.map(item => ({
      product_name: item.product_name,
      quantity_received: item.quantity_received,
      date: item.date.toISOString().split("T")[0] // ✅ removes time
    }));

    res.status(200).json({
      message: "Stock history fetched successfully",
      history: formattedHistory,
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching stock history", error: error.message });
  }
});

// ✅ Get products by branch
router.get("/by-branch", async (req, res) => {
  const { salon_id, branch_id } = req.query;
  if (!salon_id || !branch_id) {
    return res.status(400).json({ message: "salon_id and branch_id are required" });
  }

  try {
    const products = await Product.find({ salon_id, branch_id })
      .populate("branch_id brand_id category_id tag_id unit_id variation_id");

    const filtered = products.filter(p => p.branch_id);
    res.status(200).json({
      message: "Products fetched successfully",
      data: filtered.map(p => transformProduct(p, req))
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching products", error: error.message });
  }
});

// ✅ Get single product
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("branch_id brand_id category_id tag_id unit_id variation_id");

    if (!product) return res.status(404).json({ message: "Product not found" });

    res.status(200).json({
      message: "Product fetched successfully",
      data: transformProduct(product, req)
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching product", error: error.message });
  }
});

// ✅ Update product
router.put("/:id", upload.single("image"), async (req, res) => {
  try {
    const updateData = { ...req.body };

    // Parse JSON fields
    ["variation_id", "variants"].forEach(field => {
      if (updateData[field] && typeof updateData[field] === "string") {
        try {
          updateData[field] = JSON.parse(updateData[field]);
        } catch {
          return res.status(400).json({ message: `Invalid ${field} format` });
        }
      }
    });

    if (req.file) {
      updateData.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: req.file.originalname,
        extension: path.extname(req.file.originalname).slice(1)
      };
    }

    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });

    // ✅ If stock is included in PUT, increment instead of overwrite
    if (typeof updateData.stock !== "undefined") {
      const addedStock = Number(updateData.stock);

      // update actual product stock
      product.stock = (product.stock || 0) + addedStock;

      // log history
      await StockHistory.create({
        product_id: product._id,
        product_name: product.product_name,
        quantity_received: addedStock,
      });

      // remove from updateData to prevent overwrite
      delete updateData.stock;

      await product.save();
    }

    // ✅ Now update other fields (without touching stock again)
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate("branch_id brand_id category_id tag_id unit_id variation_id");

    res.status(200).json({
      message: "Product updated successfully",
      product: transformProduct(updatedProduct, req)
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating product", error: error.message });
  }
});

// ✅ Delete product
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Product not found" });

    res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting product", error: error.message });
  }
});

// ✅ Update stock
router.patch("/:id/stock", async (req, res) => {
  try {
    const { stock, variant_sku, variant_stock } = req.body;

    let product = await Product.findById(req.params.id)
      .populate("branch_id", "_id name")   // ✅ only bring branch _id + name
      .lean();

    if (!product) return res.status(404).json({ message: "Product not found" });

    // ✅ For main stock (non-variant)
    if (typeof stock !== "undefined") {
      product.stock = (product.stock || 0) + Number(stock);

      await StockHistory.create({
        product_id: product._id,
        product_name: product.product_name,
        quantity_received: Number(stock),
      });
    }

    // ✅ For variant stock
    if (variant_sku && typeof variant_stock !== "undefined") {
      const variant = product.variants.find((v) => v.sku === variant_sku);
      if (!variant) return res.status(404).json({ message: "Variant not found" });

      variant.stock = (variant.stock || 0) + Number(variant_stock);

      await StockHistory.create({
        product_id: product._id,
        product_name: `${product.product_name} (${variant_sku})`,
        quantity_received: Number(variant_stock),
      });
    }

    // ✅ Update DB
    await Product.findByIdAndUpdate(product._id, product, { new: true });

    // ✅ Format only product image, NOT branch
    if (product.image?.data) {
      const ext = product.image.extension || "jpg";
      product.image_url = `/api/products/image/${product._id}.${ext}`;
    } else {
      product.image_url = null;
    }
    delete product.image; // remove buffer

    res.status(200).json({
      message: "Stock updated and logged successfully",
      product,
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating stock", error: error.message });
  }
});

module.exports = router;