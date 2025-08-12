const mongoose = require("mongoose");

const ManagerSchema = new mongoose.Schema({
  full_name: {
    type: String,
    required: true,
  },
  image: {
    data: Buffer,
    contentType: String,
    originalName: String,
    extension: String,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  contact_number: {
    type: String,
    required: true,
  },
  password: {
    type: String,
    required: true,
  },
  gender: {
    type: String,
    enum: ["male", "female", "other"],
    required: true,
  },
  branch_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Branch",
    required: true,
  },
  salon_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Salon",
    required: true,
  },
}, { timestamps: true });

module.exports = mongoose.model("Manager", ManagerSchema);