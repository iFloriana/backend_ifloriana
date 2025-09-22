const mongoose = require("mongoose");

const PaymentSchema = new mongoose.Schema({
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
  appointment_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Appointment",
    required: true
  },
  appointment_serial_number: {
    type: String
  },
  service_amount: {
    type: Number,
    default: 0
  },
  product_amount: {
    type: Number,
    default: 0
  },
  sub_total: {
    type: Number,
    default: 0
  },
  coupon_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Coupon"
  },
  coupon_discount: {
    type: Number,
    default: 0
  },
  additional_discount: {
    type: Number,
    default: 0
  },
  additional_discount_type: {
    type: String,
    enum: ["percentage", "flat"]
  },
  membership_discount: {
    type: Number,
    default: 0
  },
  additional_charges: {
    type: Number,
    default: 0
  },
  tax_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tax"
  },
  tax_amount: {
    type: Number,
    default: 0
  },
  tips: {
    type: Number,
    default: 0
  },
  final_total: {
    type: Number,
    required: true
  },
  payment_method: {
    type: String,
    enum: ["Cash", "Card", "UPI", "Split"],
    required: true,
  },
  payment_split: [
    {
      method: {
        type: String,
        enum: ["cash", "card", "upi"],
      },
      amount: {
        type: Number,
      }
    }
  ],
  invoice_format: {
    type: String,
    enum: ["fullpage", "receipt", "halfpage", "gst_invoice"],
    default: "gst_invoice"
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  invoice_file_name: {
    type: String
  }
});

module.exports = mongoose.model("Payment", PaymentSchema);