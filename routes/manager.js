const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Manager = require("../models/Manager");
const router = express.Router();

// Create Manager
router.post("/", async (req, res) => {
  const {
    full_name,
    image,
    email,
    contact_number,
    password,
    confirm_password,
    gender,
    branch_id,
    salon_id,
  } = req.body;

  if (password !== confirm_password) {
    return res.status(400).json({ message: "Passwords do not match" });
  }

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newManager = new Manager({
      full_name,
      image,
      email,
      contact_number,
      password: hashedPassword,
      gender,
      branch_id,
      salon_id,
    });
    await newManager.save();

    res.status(201).json({ message: "Manager created successfully", data: newManager });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Manager Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const manager = await Manager.findOne({ email });
    if (!manager) {
      return res.status(404).json({ message: "Manager not found" });
    }

    const isMatch = await bcrypt.compare(password, manager.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: manager._id, salon_id: manager.salon_id }, "secretKey", { expiresIn: "1h" });
    // Exclude password from response
    const managerObj = manager.toObject();
    delete managerObj.password;
    res.status(201).json({
      token,
      message: "Login successful",
      manager: managerObj
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Upgrade existing staff to manager
router.post("/upgrade/:staffId", async (req, res) => {
  const { staffId } = req.params;
  const { password, confirm_password } = req.body;

  if (password !== confirm_password) {
    return res.status(400).json({ message: "Passwords do not match" });
  }

  try {
    const staff = await require("../models/Staff").findById(staffId);
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    const Manager = require("../models/Manager");

    // Check if already upgraded
    const existingManager = await Manager.findOne({ email: staff.email });
    if (existingManager) {
      return res.status(409).json({ message: "Staff already exists as Manager" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const manager = new Manager({
      full_name: staff.full_name,
      email: staff.email,
      contact_number: staff.phone_number,
      password: hashedPassword,
      gender: staff.gender,
      branch_id: staff.branch_id,
      salon_id: staff.salon_id,
      image: staff.image || null
    });

    await manager.save();
    return res.status(201).json({ message: "Staff upgraded to Manager", data: manager });
  } catch (error) {
    console.error("Upgrade error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get All Managers
router.get("/", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const managers = await Manager.find({ salon_id }).populate("branch_id");
    res.status(200).json({ message: "Managers fetched successfully", data: managers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get Single Manager
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const manager = await Manager.findOne({ _id: id, salon_id }).populate("branch_id");
    if (!manager) {
      return res.status(404).json({ message: "Manager not found" });
    }
    res.status(200).json({ message: "Manager fetched successfully", data: manager });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Update Manager
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { salon_id, ...updateData } = req.body;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const updatedManager = await Manager.findOneAndUpdate({ _id: id, salon_id }, updateData, { new: true });
    if (!updatedManager) {
      return res.status(404).json({ message: "Manager not found" });
    }
    res.status(200).json({ message: "Manager updated successfully", data: updatedManager });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete Manager
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const deletedManager = await Manager.findOneAndDelete({ _id: id, salon_id });
    if (!deletedManager) {
      return res.status(404).json({ message: "Manager not found" });
    }
    res.status(200).json({ message: "Manager deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});
module.exports = router;