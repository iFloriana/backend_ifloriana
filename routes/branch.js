const express = require("express");
const Branch = require("../models/Branch");
const Staff = require("../models/Staff");
const router = express.Router();
const getUploader = require("../middleware/imageUpload"); // ✅ Use the image upload middleware
const upload = getUploader("branch_images"); // ✅ Specify the folder for branch images

// ------------------- POST: Create Branch -------------------
router.post("/", upload.single("image"), async (req, res) => {
  const { salon_id } = req.body;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const branchData = { ...req.body };

    // ✅ Set image path if image is uploaded
    if (req.file) {
      branchData.image = req.file.path.replace(/\\/g, "/");
    }

    const newBranch = new Branch(branchData);
    await newBranch.save();

    res.status(201).json({
      message: "Branch created successfully",
      data: newBranch,
    });
  } catch (error) {
    console.error("Create branch error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});


// ------------------- PUT: Update Branch -------------------
router.put("/:id", upload.single("image"), async (req, res) => {
  try {
    const updateData = { ...req.body };

    // ✅ Set new image path if uploaded
    if (req.file) {
      updateData.image = req.file.path.replace(/\\/g, "/");
    }

    const updatedBranch = await Branch.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updatedBranch) {
      return res.status(404).json({ message: "Branch not found" });
    }

    res.json({ message: "Branch updated", data: updatedBranch });
  } catch (error) {
    console.error("Update branch error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});


// ------------------- GET: All Branches -------------------
router.get("/", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const branches = await Branch.find({ salon_id })
      .populate("salon_id")
      .populate({
        path: "service_id",
        populate: {
          path: "category_id",
          select: "_id name",
        },
      });

    const staffCounts = await Staff.aggregate([
      {
        $group: {
          _id: "$branch_id",
          count: { $sum: 1 },
        },
      },
    ]);

    const countMap = {};
    staffCounts.forEach(({ _id, count }) => {
      if (_id) countMap[_id.toString()] = count;
    });

    const branchData = branches.map((branch) => ({
      ...branch.toObject(),
      staff_count: countMap[branch._id.toString()] || 0,
    }));

    res.status(200).json({
      message: "Branches fetched successfully",
      data: branchData,
    });
  } catch (error) {
    console.error("Fetch branches error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});


// ------------------- GET: Branch Names -------------------
router.get("/names", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const branchNames = await Branch.find({ salon_id }, { name: 1 });
    res.status(200).json({
      message: "Branch names and IDs fetched successfully",
      data: branchNames,
    });
  } catch (error) {
    console.error("Fetch branch names error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});


// ------------------- GET: Single Branch -------------------
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const branch = await Branch.findById(id)
      .populate("salon_id")
      .populate("service_id");

    if (!branch) {
      return res.status(404).json({ message: "Branch not found" });
    }

    const staffCount = await Staff.countDocuments({ branch_id: id });

    res.status(200).json({
      message: "Branch fetched successfully",
      data: {
        ...branch.toObject(),
        staff_count: staffCount,
      },
    });
  } catch (error) {
    console.error("Fetch branch error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});


// ------------------- DELETE: Branch -------------------
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const deletedBranch = await Branch.findByIdAndDelete(id);

    if (!deletedBranch) {
      return res.status(404).json({ message: "Branch not found" });
    }

    res.status(200).json({ message: "Branch deleted successfully" });
  } catch (error) {
    console.error("Delete branch error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;