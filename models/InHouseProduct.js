const mongoose = require("mongoose");

const InHouseProductSchema = new mongoose.Schema({
  salon_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Salon",
    required: true
  },
  branch_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true
  },
  staff_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Staff",
    required: false
  },
  product: [{
    product_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true
    },
    variant_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: false
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    }
  }]
}, { timestamps: true });

module.exports = mongoose.model("InHouseProduct", InHouseProductSchema);