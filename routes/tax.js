// tax.js
const express = require("express");
const Tax = require("../models/Tax");
const Branch = require("../models/Branch");
const Salon = require("../models/Salon");
const router = express.Router();
const mongoose = require("mongoose");

// Middleware to validate salon_id
const validateSalonId = async (req, res, next) => {
    const { salon_id } = req.query; // Assuming salon_id is in query for GET, and in body for POST/PUT/DELETE
    if (!salon_id && !req.body.salon_id) { // Check both query and body for salon_id
        return res.status(400).json({ message: "salon_id is required" });
    }

    const currentSalonId = salon_id || req.body.salon_id; // Use salon_id from query or body
    const salonExists = await Salon.findById(currentSalonId);
    if (!salonExists) {
        return res.status(404).json({ message: "Salon not found" });
    }

    next();
};

// Apply middleware to all routes
router.use(validateSalonId);

// Create Tax
router.post("/", async (req, res) => {
    const { branch_id, title, value, type, tax_type, status } = req.body;
    const { salon_id } = req.body; // Get salon_id from body for POST request

    try {
        // Validate each branch_id in the array
        if (!Array.isArray(branch_id) || branch_id.length === 0) {
            return res.status(400).json({ message: "branch_id must be an array and cannot be empty" });
        }

        for (let i = 0; i < branch_id.length; i++) {
            const branchExists = await Branch.findOne({ _id: branch_id[i], salon_id });
            if (!branchExists) {
                return res.status(404).json({ message: `Branch with ID ${branch_id[i]} not found or does not belong to the specified salon` });
            }
        }

        const newTax = new Tax({ branch_id, title, value, type, tax_type, status, salon_id }); // Include salon_id in new Tax object
        await newTax.save();
        res.status(201).json({ message: "Tax created successfully", data: newTax });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

// ✅ Helper to format branch with image_url
function formatBranchWithImageURL(branch) {
  if (!branch) return null;

  const branchObj = { ...branch }; // clone so we can mutate safely

  branchObj.image_url = branchObj.image?.data
    ? `/api/branches/image/${branchObj._id}.${branchObj.image?.extension || "jpg"}`
    : null;

  delete branchObj.image; // remove raw buffer completely
  return branchObj;
}

// ----------------------
// GET: All Taxes
// ----------------------
router.get("/", async (req, res) => {
  const { salon_id } = req.query;

  try {
    const taxes = await Tax.find({ salon_id })
      .populate({
        path: "branch_id",
        select: "_id name image" // ✅ only include what we need
      })
      .lean();

    const data = taxes.map((tax) => ({
      ...tax,
      branch_id: Array.isArray(tax.branch_id)
        ? tax.branch_id.map(formatBranchWithImageURL)
        : formatBranchWithImageURL(tax.branch_id),
    }));

    res.status(200).json({ message: "Taxes fetched successfully", data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// ----------------------
// GET: Taxes by Branch
// ----------------------
router.get("/by-branch", async (req, res) => {
  const { salon_id, branch_id } = req.query;

  if (!salon_id || !branch_id) {
    return res.status(400).json({ message: "salon_id and branch_id are required" });
  }

  try {
    const taxes = await Tax.find({
      salon_id: new mongoose.Types.ObjectId(salon_id),
      branch_id: new mongoose.Types.ObjectId(branch_id),
    })
      .populate({
        path: "branch_id",
        match: { _id: new mongoose.Types.ObjectId(branch_id) },
        select: "_id name image",
      })
      .lean();

    const filtered = taxes.filter((tax) => tax.branch_id?.length > 0);

    const data = filtered.map((tax) => ({
      ...tax,
      branch_id: Array.isArray(tax.branch_id)
        ? tax.branch_id.map(formatBranchWithImageURL)
        : formatBranchWithImageURL(tax.branch_id),
    }));

    res.status(200).json({ message: "Taxes fetched successfully", data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// ----------------------
// GET: Single Tax
// ----------------------
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.query;

  try {
    const tax = await Tax.findOne({ _id: id, salon_id })
      .populate({
        path: "branch_id",
        select: "_id name image",
      })
      .lean();

    if (!tax) {
      return res.status(404).json({ message: "Tax not found or does not belong to the specified salon" });
    }

    tax.branch_id = Array.isArray(tax.branch_id)
      ? tax.branch_id.map(formatBranchWithImageURL)
      : formatBranchWithImageURL(tax.branch_id);

    res.status(200).json({ message: "Tax fetched successfully", data: tax });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Update Tax
router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { salon_id } = req.body; // Get salon_id from body for PUT request
    const updateData = req.body;

    try {
        // Ensure the tax belongs to the salon
        const tax = await Tax.findOne({ _id: id, salon_id: salon_id });
        if (!tax) {
            return res.status(404).json({ message: "Tax not found or does not belong to the specified salon" });
        }

        // Validate branch_id if it's being updated
        if (updateData.branch_id && Array.isArray(updateData.branch_id)) {
            for (let i = 0; i < updateData.branch_id.length; i++) {
                const branchExists = await Branch.findOne({ _id: updateData.branch_id[i], salon_id });
                if (!branchExists) {
                    return res.status(404).json({ message: `Branch with ID ${updateData.branch_id[i]} not found or does not belong to the specified salon` });
                }
            }
        }


        const updatedTax = await Tax.findByIdAndUpdate(id, updateData, { new: true });
        res.status(200).json({ message: "Tax updated successfully", data: updatedTax });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

// Delete Tax
router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    const { salon_id } = req.query; // Assuming salon_id is in query for DELETE request

    try {
        const tax = await Tax.findOne({ _id: id, salon_id: salon_id });

        if (!tax) {
            return res.status(404).json({ message: "Tax not found or does not belong to the specified salon" });
        }

        await Tax.findByIdAndDelete(id);
        res.status(200).json({ message: "Tax deleted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;