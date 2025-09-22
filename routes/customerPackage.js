const express = require("express");
const router = express.Router();
const CustomerPackage = require("../models/CustomerPackage");

// Get all customer packages filtered by salon_id with necessary population
// Updated GET route to include image in customer details
// ------------------- GET: All Customer Packages -------------------
router.get("/", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const customerPackages = await CustomerPackage.find({ salon_id })
      .populate("customer_id", "full_name email phone_number image")
      .populate("package_details.service_id", "name price")
      .populate("branch_package_id", "package_name")
      .lean();

    const data = customerPackages.map(pkg => {
      if (pkg.customer_id) {
        pkg.customer_id.image_url = pkg.customer_id.image?.data
          ? `/api/customers/image/${pkg.customer_id._id}.${pkg.customer_id.image.extension || "jpg"}`
          : null;

        delete pkg.customer_id.image; // 🚀 remove buffer
      }
      return pkg;
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Error fetching customer packages:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ------------------- GET: Customer Packages by Customer ID -------------------
router.get("/by-customer/:customer_id", async (req, res) => {
  try {
    const packages = await CustomerPackage.find({ customer_id: req.params.customer_id })
      .populate("package_details.service_id", "name")
      .populate("branch_id", "name")
      .populate("branch_package_id", "package_name")
      .populate("customer_id", "full_name email phone_number image")
      .lean();

    const data = packages.map(pkg => {
      if (pkg.customer_id) {
        pkg.customer_id.image_url = pkg.customer_id.image?.data
          ? `/api/customers/image/${pkg.customer_id._id}.${pkg.customer_id.image.extension || "jpg"}`
          : null;

        delete pkg.customer_id.image; // 🚀 remove buffer
      }
      return pkg;
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Update service quantity after usage
router.patch("/use-service/:package_id/:service_id", async (req, res) => {
  try {
    const { package_id, service_id } = req.params;

    const customerPackage = await CustomerPackage.findById(package_id);
    if (!customerPackage) {
      return res.status(404).json({ message: "CustomerPackage not found" });
    }

    // Find the service inside package
    const service = customerPackage.package_details.find(item => item.service_id.toString() === service_id);
    if (!service || service.quantity <= 0) {
      return res.status(400).json({ message: "Service not available or already used up" });
    }

    service.quantity -= 1;
    await customerPackage.save();

    res.status(200).json({ message: "Service usage updated", data: customerPackage });
  } catch (error) {
    res.status(500).json({ message: "Server error", error });
  }
});

module.exports = router;