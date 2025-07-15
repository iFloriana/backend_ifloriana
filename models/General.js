const mongoose = require("mongoose");

const GeneralSchema = new mongoose.Schema({
    app_name: {
        type: String,
        required: true
    },
    footer_text: {
        type: String,
        required: true
    },
    copyright_text: {
        type: String,
        required: true
    },
    ui_text: {
        type: String,
        required: true
    },
    contact_number: {
        type: String,
        required: true
    },
    inquiry_email: {
        type: String,
        required: true
    },
    site_description: {
        type: String,
        required: true
    },
    building_name: {
        type: String,
        required: true
    },
    landmark: {
        type: String,
        required: true
    },
    country: {
        type: String,
        required: true
    },
    state: {
        type: String,
        required: true
    },
    city: {
        type: String,
        required: true
    },
    postal_code: {
        type: String,
        required: true
    },
    latitude: {
        type: String,
        required: false
    },
    longitude: {
        type: String,
        required: false
    },
    logo: {
        type: String,
        required: false
    },
    mini_logo: {
        type: String,
        required: false
    },
    dark_logo: {
        type: String,
        required: false
    },
    dark_mini_logo: {
        type: String,
        required: false
    },
    favicon: {
        type: String,
        required: false
    },
}, { timestamps: true });

module.exports = mongoose.model("General", GeneralSchema);