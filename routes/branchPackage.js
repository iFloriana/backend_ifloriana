const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ dest: "uploads/" });
const BranchPackage = require("../models/BranchPackage");
const Service = require("../models/Service");
const mongoose = require("mongoose");

// Utility function with improved error handling
function calculatePackagePrice(package_details) {
  try {
    if (!Array.isArray(package_details)) {
      throw new Error("package_details must be an array");
    }

    return package_details.reduce((total, detail) => {
      const price = Number(detail.discounted_price) || 0;
      const qty = Number(detail.quantity) || 0;
      return total + (price * qty);
    }, 0);
  } catch (error) {
    console.error("Error calculating package price:", error);
    return 0;
  }
}

// Create with enhanced validation
router.post("/", upload.single("image"), async (req, res) => {
  try {
    let {
      branch_id,
      package_name,
      description,
      start_date,
      end_date,
      package_details,
      salon_id,
    } = req.body;

    // Ensure branch_id is an array
    if (!Array.isArray(branch_id)) {
      try {
        branch_id = JSON.parse(branch_id); // Handle if sent as stringified array
      } catch (err) {
        return res.status(400).json({ message: "branch_id must be an array or JSON string" });
      }
    }

    // Validate salon_id and each branch_id
    if (
      !mongoose.Types.ObjectId.isValid(salon_id) ||
      !Array.isArray(branch_id) ||
      branch_id.some(id => !mongoose.Types.ObjectId.isValid(id))
    ) {
      return res.status(400).json({ message: "Invalid salon_id or branch_id" });
    }

    // Handle package_details if stringified
    if (typeof package_details === "string") {
      try {
        package_details = JSON.parse(package_details);
      } catch (error) {
        return res.status(400).json({ message: "Invalid package_details format" });
      }
    }

    const package_price = calculatePackagePrice(package_details);

    const newBranchPackage = new BranchPackage({
      branch_id,
      package_name,
      description,
      start_date,
      end_date,
      package_details,
      package_price,
      salon_id,
    });

    const savedPackage = await newBranchPackage.save();

    res.status(201).json({
      message: "Branch package created successfully",
      data: savedPackage,
    });
  } catch (error) {
    console.error("Error creating branch package:", error);
    res.status(500).json({ message: "Server error", error });
  }
});

// Get package names with validation
router.get('/names', async (req, res) => {
  try {
    const { salon_id } = req.query;
    if (!salon_id) {
      return res.status(400).json({ success: false, message: 'salon_id is required' });
    }

    const packages = await BranchPackage.find({ salon_id }, 'package_name _id');
    res.status(200).json({ success: true, data: packages });
  } catch (error) {
    console.error('Error fetching package names:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message
    });
  }
});

// Get all packages with improved error handling
router.get("/", async (req, res) => {
  try {
    const { salon_id } = req.query;

    if (!salon_id) {
      return res.status(400).json({ message: "salon_id is required" });
    }

    if (!mongoose.isValidObjectId(salon_id)) {
      return res.status(400).json({ message: "Invalid salon_id format" });
    }

    const branchPackages = await BranchPackage.find({ salon_id })
      .populate("branch_id", "name")
      .populate("package_details.service_id", "name regular_price duration");

    res.status(200).json({ 
      message: "Branch packages fetched successfully", 
      data: branchPackages 
    });
  } catch (error) {
    console.error("Error fetching branch packages:", error);
    res.status(500).json({ 
      message: "Server error", 
      error: error.message 
    });
  }
});

// get package details filtered by branch_id
router.get("/by-branch", async (req, res) => {
  try {
    const { salon_id, branch_id } = req.query;

    if (!salon_id || !branch_id) {
      return res.status(400).json({ message: "salon_id and branch_id are required" });
    }

    if (!mongoose.isValidObjectId(salon_id) || !mongoose.isValidObjectId(branch_id)) {
      return res.status(400).json({ message: "Invalid salon_id or branch_id format" });
    }

    const branchPackages = await BranchPackage.find({ salon_id, branch_id })
      .populate("branch_id", "name")
      .populate("package_details.service_id", "name regular_price duration");

    res.status(200).json({ 
      message: "Branch packages fetched successfully", 
      data: branchPackages 
    });
  } catch (error) {
    console.error("Error fetching branch packages:", error);
    res.status(500).json({ 
      message: "Server error", 
      error: error.message 
    });
  }
});

// Get single package with ID validation
router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid package ID format" });
    }

    const pkg = await BranchPackage.findById(req.params.id)
      .populate("branch_id", "name address")
      .populate("package_details.service_id", "name description regular_price");

    if (!pkg) {
      return res.status(404).json({ message: "Package not found" });
    }

    res.json(pkg);
  } catch (error) {
    console.error("Failed to fetch package:", error);
    res.status(500).json({ 
      message: "Failed to fetch package", 
      error: error.message 
    });
  }
});

// Update package with comprehensive validation
router.put("/:id", upload.single("image"), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid package ID format" });
    }

    let { package_details, ...rest } = req.body;

    if (package_details) {
      if (typeof package_details === "string") {
        try {
          package_details = JSON.parse(package_details);
        } catch (e) {
          return res.status(400).json({ message: "Invalid package_details format" });
        }
      }

      if (!Array.isArray(package_details)) {
        return res.status(400).json({ message: "package_details must be an array" });
      }

      // Validate each service
      for (const detail of package_details) {
        if (!detail.service_id || !mongoose.isValidObjectId(detail.service_id)) {
          return res.status(400).json({ message: "Invalid service_id in package_details" });
        }

        const service = await Service.findOne({ 
          _id: detail.service_id, 
          status: 1 
        });
        
        if (!service) {
          return res.status(400).json({ 
            message: `Inactive or invalid service: ${detail.service_id}` 
          });
        }
      }

      rest.package_details = package_details;
    }

    const updatedPackage = await BranchPackage.findByIdAndUpdate(
      req.params.id,
      rest,
      { new: true, runValidators: true }
    );

    if (!updatedPackage) {
      return res.status(404).json({ message: "Package not found" });
    }

    res.status(200).json({ 
      message: "Package updated successfully", 
      data: updatedPackage 
    });
  } catch (error) {
    console.error("Failed to update package:", error);
    res.status(500).json({ 
      message: "Failed to update package", 
      error: error.message 
    });
  }
});

// Delete package with validation
router.delete("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid package ID format" });
    }

    const deletedPackage = await BranchPackage.findByIdAndDelete(req.params.id);
    
    if (!deletedPackage) {
      return res.status(404).json({ message: "Package not found" });
    }

    res.json({ 
      message: "Package deleted successfully",
      deletedId: deletedPackage._id 
    });
  } catch (error) {
    console.error("Failed to delete package:", error);
    res.status(500).json({ 
      message: "Failed to delete package", 
      error: error.message 
    });
  }
});

module.exports = router;