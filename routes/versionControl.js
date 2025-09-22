const express = require("express");
const VersionControl = require("../models/VersionControl");
const router = express.Router();

// POST: Create a new version control document
router.post("/", async (req, res) => {
    try {
        const { latest_version, force_update, play_store_url, app_store_url } = req.body;
        const version = new VersionControl({
            latest_version,
            force_update,
            play_store_url,
            app_store_url
        });
        await version.save();
        res.status(201).json(version);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

// GET: Get the latest version control info
router.get("/", async (req, res) => {
    try {
        // Always return the latest (or first) version control document
        const version = await VersionControl.findOne().sort({ updatedAt: -1 });
        if (!version) {
            return res.status(404).json({ message: "No version control info found" });
        }
        res.status(200).json(version);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

// PUT: Update a specific version control document by ID
router.put("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { latest_version, force_update, play_store_url, app_store_url } = req.body;
        const updated = await VersionControl.findByIdAndUpdate(
            id,
            { latest_version, force_update, play_store_url, app_store_url },
            { new: true }
        );
        if (!updated) {
            return res.status(404).json({ message: "Version control document not found" });
        }
        res.status(200).json(updated);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
});

module.exports = router;
