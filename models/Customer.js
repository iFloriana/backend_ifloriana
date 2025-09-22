const mongoose = require("mongoose");

const CustomerSchema = new mongoose.Schema({
  image: {
    data: Buffer,
    contentType: String,
    originalName: String,
    extension: String,
  },
  full_name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    unique: true,
    sparse: true,
    default: undefined,
    set: v => (v === '' ? undefined : v),
  },
  phone_number: {
    type: String,
    required: true,
  },
  gender: {
    type: String,
    enum: ["male", "female", "other"],
    required: true,
  },
  salon_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Salon",
    required: true,
  },

  // unified structure for package + membership history
  package_and_membership: [
    {
      branch_package: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "BranchPackage",
      },
      branch_membership: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "BranchMembership",
      },
      payment_method: {
        type: String,
        enum: ["Cash", "Card", "UPI", "Split"],
      },
      date: {
        type: Date,
        default: Date.now
      }
    }
  ],

  status: {
    type: Number,
    enum: [0, 1],
    default: 1,
  },
  payment_split: [
    {
      method: { type: String, enum: ["cash", "card", "upi"] },
      amount: { type: Number },
    },
  ],
}, { timestamps: true });

module.exports = mongoose.model("Customer", CustomerSchema);