const express = require("express");
const router = express.Router();
const InHouseProduct = require("../models/InHouseProduct");
const Product = require("../models/Product");

// POST new in-house product usage (multiple items)
router.post("/", async (req, res) => {
  try {
    const { salon_id, branch_id, staff_id, product = [] } = req.body;

    if (!salon_id || !branch_id || !Array.isArray(product) || product.length === 0) {
      return res.status(400).json({ message: "salon_id, branch_id and product array are required" });
    }

    // Deduct stock for each product item
    for (const item of product) {
      const { product_id, variant_id, quantity } = item;
      if (!product_id || !quantity) {
        return res.status(400).json({ message: "product_id and quantity are required for each item" });
      }

      const prodDoc = await Product.findById(product_id);
      if (!prodDoc) return res.status(404).json({ message: `Product not found: ${product_id}` });

      if (prodDoc.has_variations) {
        if (!variant_id) {
          return res.status(400).json({ message: `variant_id is required for product ${product_id}` });
        }

        const variant = prodDoc.variants.find(v => v._id.toString() === variant_id);
        if (!variant) return res.status(404).json({ message: `Variant not found in product ${product_id}` });

        if (variant.stock < quantity) {
          return res.status(400).json({ message: `Insufficient stock in variant for product ${product_id}` });
        }

        variant.stock -= quantity;
      } else {
        if (typeof prodDoc.stock !== "number" || prodDoc.stock < quantity) {
          return res.status(400).json({ message: `Insufficient or invalid stock for product ${product_id}` });
        }

        prodDoc.stock -= quantity;
      }

      await prodDoc.save();
    }

    const usage = new InHouseProduct({ salon_id, branch_id, staff_id, product });
    const saved = await usage.save();

    const populated = await InHouseProduct.findById(saved._id)
      .populate("product.product_id")
      .populate("product.variant_id")
      .populate("staff_id")
      .populate("salon_id")
      .populate("branch_id");

    res.status(201).json({ message: "Usage recorded", data: populated });
  } catch (err) {
    res.status(500).json({ message: "Error creating record", error: err.message });
  }
});

// ===== Helpers =====

// ✅ Clean staff object
function transformStaff(staff, req) {
  if (!staff) return staff;
  const staffObj = staff.toObject ? staff.toObject() : staff;

  staffObj.image_url = staffObj.image?.data
    ? `${req.protocol}://${req.get("host")}/api/staffs/image/${staffObj._id}.${staffObj.image?.extension || "jpg"}`
    : null;

  delete staffObj.image;
  return staffObj;
}

// ✅ Clean product object
function transformProduct(product, req) {
  if (!product) return product;
  const productObj = product.toObject ? product.toObject() : product;

  productObj.image_url = productObj.image?.data
    ? `${req.protocol}://${req.get("host")}/api/products/image/${productObj._id}.${productObj.image?.extension || "jpg"}`
    : null;

  delete productObj.image;
  return productObj;
}

// ===== ROUTES =====

// GET all usage records filtered by salon_id
router.get("/", async (req, res) => {
  const { salon_id } = req.query;
  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const records = await InHouseProduct.find({ salon_id })
      .populate("product.product_id")
      .populate("staff_id")
      .populate("salon_id", "salon_name")
      .populate("branch_id", "name");

    const updatedRecords = records.map(record => {
      const resolvedProducts = record.product.map(p => {
        const productDoc = p.product_id;
        const matchedVariant = productDoc?.variants?.find(
          v => v._id.toString() === p.variant_id?.toString()
        );
        return {
          ...p.toObject(),
          product_id: transformProduct(productDoc, req), // ✅ fix product image
          variant: matchedVariant || null
        };
      });

      return {
        ...record.toObject(),
        product: resolvedProducts,
        staff_id: transformStaff(record.staff_id, req) // ✅ fix staff image
      };
    });

    res.json({ message: "Records fetched", data: updatedRecords });
  } catch (err) {
    res.status(500).json({ message: "Error fetching records", error: err.message });
  }
});

// GET records by branch
router.get("/by-branch", async (req, res) => {
  const { salon_id, branch_id } = req.query;

  if (!salon_id || !branch_id) {
    return res.status(400).json({ message: "salon_id and branch_id are required" });
  }

  try {
    const records = await InHouseProduct.find({ salon_id, branch_id })
      .populate("product.product_id")
      .populate("staff_id")
      .populate("salon_id", "salon_name")
      .populate("branch_id", "name");

    const updatedRecords = records.map(record => {
      const resolvedProducts = record.product.map(p => {
        const productDoc = p.product_id;
        const matchedVariant = productDoc?.variants?.find(
          v => v._id.toString() === p.variant_id?.toString()
        );
        return {
          ...p.toObject(),
          product_id: transformProduct(productDoc, req), // ✅ fix product image
          variant: matchedVariant || null
        };
      });

      return {
        ...record.toObject(),
        product: resolvedProducts,
        staff_id: transformStaff(record.staff_id, req) // ✅ fix staff image
      };
    });

    res.json({ message: "Records fetched", data: updatedRecords });
  } catch (err) {
    res.status(500).json({ message: "Error fetching records", error: err.message });
  }
});

// GET single usage by ID
router.get("/:id", async (req, res) => {
  try {
    const record = await InHouseProduct.findById(req.params.id)
      .populate("product.product_id")
      .populate("staff_id")
      .populate("salon_id", "salon_name")
      .populate("branch_id", "name");

    if (!record) return res.status(404).json({ message: "Record not found" });

    const resolvedProducts = record.product.map(p => {
      const productDoc = p.product_id;
      const matchedVariant = productDoc?.variants?.find(
        v => v._id.toString() === p.variant_id?.toString()
      );
      return {
        ...p.toObject(),
        product_id: transformProduct(productDoc, req), // ✅ fix product image
        variant: matchedVariant || null
      };
    });

    res.json({
      message: "Record fetched",
      data: {
        ...record.toObject(),
        product: resolvedProducts,
        staff_id: transformStaff(record.staff_id, req) // ✅ fix staff image
      }
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching record", error: err.message });
  }
});

// DELETE usage
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await InHouseProduct.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Record not found" });
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting record", error: err.message });
  }
});

module.exports = router;