const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    full_name: String,
    email: {
        type: String,
        unique: true
    },
    phone_number: String,
    address: String,
    password: String,
    image: String,
    role: {
        type: String,
        enum: ["admin", "manager", "customer", "superadmin"],
        required: true,
    },
    package_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SuperAdminPackage",
    },
    package_start_date: Date,
    package_expiration_date: Date,
});

module.exports = mongoose.model("User", userSchema);
