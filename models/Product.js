const mongoose = require("mongoose");

const ProductSchema = new mongoose.Schema({
  branch_id: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
    }
  ],
  image: {
    data: Buffer,
    contentType: String,
    originalName: String,
    extension: String,
  },
  product_name: {
    type: String,
    required: true,
  },
  description: {
    type: String, 
    required: true,
  },
  brand_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Brand",
    required: true,
  },
  category_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ProductCategory",
    required: true,
  },
  tag_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tag",
    required: true,
  },
  unit_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Units",
    required: true,
  },
  price: {
    type: Number,
    required: false,
  },
  stock: {
    type: Number,
    required: false,
  },
  sku: {
    type: String,
    required: false,
  },
  code: {
    type: String,
    required: false
  },
  status: {
    type: Number,
    enum: [0, 1],
    default: 1,
  },
  has_variations: {
    type: Number,
    enum: [0, 1],
    default: 0,
  },
  variation_id: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Variation",
      required: false 
    }
  ],
  variants: [
    {
      combination: [{ variation_type: String, variation_value: String }],
      price: Number,
      stock: Number,
      sku: String,
      code: String
    }
  ],
  salon_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Salon",
    required: true,
  },  
}, { timestamps: true, strict: false });

module.exports = mongoose.model("Product", ProductSchema);