const mongoose = require("mongoose");

const VersionControlSchema = new mongoose.Schema({
    latest_version: {
        type: String,
        default: "1.0.0",
        required: true
    },
    force_update: {
        type: Boolean,
        default: true
    },
    play_store_url: {
        type: String,
        default: ""
    },
    app_store_url: {
        type: String,
        default: ""
    }
}, { timestamps: true });

module.exports = mongoose.model("VersionControl", VersionControlSchema);
