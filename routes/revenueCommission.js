const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const RevenueCommission = require("../models/RevenueCommission");

//create revenue commission
router.post("/", async (req, res) => {
    const { salon_id, branch_id, commission_name, commission_type, commission } = req.body;

    if (!salon_id) {
        return res.status(400).json({ message: "salon_id is required" });
    }

    try {
        const newCommission = new RevenueCommission({
            salon_id,
            branch_id,
            commission_name,
            commission_type,
            commission,
        });

        await newCommission.save();
        res.status(201).json({ message: "Revenue commission created successfully", data: newCommission });
    } catch (error) {
        console.error("Error creating revenue commission: ", error);
        res.status(500).json({ message: "Error creating revenue commission", error });
    }
});

// ✅ Helper to format branch image
function formatBranchWithImageURL(branch) {
    if (!branch) return null;

    const branchObj = { ...branch };

    branchObj.image_url = branchObj.image?.data
        ? `/api/branches/image/${branchObj._id}.${branchObj.image?.extension || "jpg"}`
        : null;

    delete branchObj.image; // remove raw buffer
    return branchObj;
}

// ----------------------
// GET: All Revenue Commissions
// ----------------------
router.get("/", async (req, res) => {
    const { salon_id } = req.query;

    if (!salon_id) {
        return res.status(400).json({ message: "salon_id is required" });
    }

    try {
        const commissions = await RevenueCommission.find({ salon_id })
            .populate({
                path: "branch_id",
                select: "_id name image", // ✅ only bring what we need
            })
            .lean();

        const data = commissions.map((commission) => ({
            ...commission,
            branch_id: Array.isArray(commission.branch_id)
                ? commission.branch_id.map(formatBranchWithImageURL)
                : formatBranchWithImageURL(commission.branch_id),
        }));

        res.status(200).json({ message: "Revenue commissions fetched successfully", data });
    } catch (error) {
        console.error("Error fetching revenue commissions: ", error);
        res.status(500).json({ message: "Error fetching revenue commissions", error });
    }
});

router.get("/names", async (req, res) => {
    const { salon_id } = req.query;

    if (!salon_id) {
        return res.status(400).json({ message: "salon_id is required" });
    }

    if (!mongoose.Types.ObjectId.isValid(salon_id)) {
        return res.status(400).json({ message: "Invalid salon_id" });
    }

    try {
        const revenueCommissions = await RevenueCommission.find({ salon_id }, { _id: 1, commission_name: 1 });
        res.status(200).json({ success: true, data: revenueCommissions });
    } catch (error) {
        res.status(500).json({ success: false, message: "Failed to fetch revenue commissions", error: error.message });
    }
});

// update
router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { salon_id, ...updateData } = req.body;

    if (!salon_id) {
        return res.status(400).json({ message: "salon_id is required" });
    }

    try {
        const updatedCommission = await RevenueCommission.findOneAndUpdate({ _id: id, salon_id }, updateData, { new: true });
        if (!updatedCommission) {
            return res.status(404).json({ message: "Revenue commission not found" });
        }
        res.status(200).json({ message: "Revenue commission updated successfully", data: updatedCommission });
    } catch (error) {
        console.error("Error updating revenue commission: ", error);
        res.status(500).json({ message: "Error updating revenue commission", error });
    }
});

// delete
router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    const { salon_id } = req.query;

    if (!salon_id) {
        return res.status(400).json({ message: "salon_id is required" });
    }

    try {
        const deletedCommission = await RevenueCommission.findOneAndDelete({ _id: id, salon_id });
        if (!deletedCommission) {
            return res.status(404).json({ message: "Revenue commission not found" });
        }
        res.status(200).json({ message: "Revenue commission deleted successfully" });
    } catch (error) {
        console.error("Error deleting revenue commission: ", error);
        res.status(500).json({ message: "Error deleting revenue commission", error });
    }
});

module.exports = router;