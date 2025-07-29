const mongoose = require("mongoose");

const StaffSchema = new mongoose.Schema({
  full_name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: false,
    unique: true,
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
  service_id: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Service",
      required: true,
    }
  ],
  status: {
    type: Number,
    enum: [0, 1],
    default: 1,
  },
  image: {
    type: String,
    required: false,
  },
  show_in_calendar: {
    type: Boolean,
    default: false,
  },
  assign_time: {
    start_shift: {
      type: String,
      required: true,
    },
    end_shift: { 
      type: String,
      required: true,
    },
  },
  lunch_time: {
    duration: {
      type: Number,
      required: true,
    },
    timing: {
      type: String,
      required: true,
    },
  },
  specialization: {
    type: String,
    required: false,
  },
  assigned_commission_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "RevenueCommission",
    required: false,
  }
}, { timestamps: true });

module.exports = mongoose.model("Staff", StaffSchema);