const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Manager = require("../models/Manager");
const getUploader = require("../middleware/imageUpload"); // ✅ Use the image upload middleware
const upload = getUploader();
const router = express.Router();
const path = require("path");
const mongoose = require("mongoose");

router.get("/image/:filename", async (req, res) => {
  try {
    const id = req.params.filename.split(".")[0];

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Branch ID" });
    }

    const manager = await Manager.findById(id);
    if (!manager?.image?.data) {
      return res.status(404).json({ message: "Image not found" });
    }

    const contentType = manager.image.contentType || "image/jpeg";
    res.type(contentType);
    res.set("Content-Disposition", "inline");

    res.send(Buffer.from(manager.image.data));
  } catch (err) {
    console.error("Image fetch error: ", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ------------------- Create Manager -------------------
router.post("/", upload.single("image"), async (req, res) => {
  try {
    const {
      full_name,
      email,
      contact_number,
      password,
      confirm_password,
      gender,
      branch_id,
      salon_id,
    } = req.body;

    const image = req.file
      ? {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: req.file.originalname,
        extension: path.extname(req.file.originalname).slice(1)
      }
      : undefined;

    if (password !== confirm_password) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    if (!salon_id) {
      return res.status(400).json({ message: "salon_id is required" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newManager = new Manager({
      full_name,
      email,
      contact_number,
      password: hashedPassword,
      gender,
      branch_id,
      salon_id,
      image,
    });

    await newManager.save();

    res.status(201).json({
      message: "Manager created successfully",
      data: newManager,
    });
  } catch (error) {
    console.error("Create manager error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ------------------- Manager Login -------------------
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const manager = await Manager.findOne({ email }).populate({
      path: "branch_id",
      select: "_id name",
    });

    if (!manager) {
      return res.status(404).json({ message: "Manager not found" });
    }

    const isMatch = await bcrypt.compare(password, manager.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: manager._id, salon_id: manager.salon_id },
      "secretKey",
      { expiresIn: "1h" }
    );

    const managerObj = manager.toObject();

    // ✅ Construct image preview URL if image exists
    if (managerObj.image?.data) {
      managerObj.image_url = `/api/managers/image/${managerObj._id}.${managerObj.image.extension || 'jpg'}`;
      delete managerObj.image; // ✅ Remove base64 blob
    } else {
      managerObj.image_url = null;
    }

    delete managerObj.password; // Optional: remove password

    res.status(200).json({
      token,
      message: "Login successful",
      manager: managerObj,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ------------------- Upgrade Staff to Manager -------------------
router.post("/upgrade/:staffId", async (req, res) => {
  const { staffId } = req.params;
  const { password, confirm_password } = req.body;

  if (password !== confirm_password) {
    return res.status(400).json({ message: "Passwords do not match" });
  }

  try {
    const Staff = require("../models/Staff");
    const staff = await Staff.findById(staffId);
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    const existingManager = await Manager.findOne({ email: staff.email });
    if (existingManager) {
      return res
        .status(409)
        .json({ message: "Staff already exists as Manager" });
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
      image: staff.image || null,
    });

    await manager.save();
    res.status(201).json({ message: "Staff upgraded to Manager", data: manager });
  } catch (error) {
    console.error("Upgrade error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ------------------- Get All Managers -------------------
router.get("/", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const managers = await Manager.find({ salon_id }).populate("branch_id");

    const data = managers.map((manager) => {
      const obj = manager.toObject();
      obj.image_url = manager.image?.data
        ? `/api/managers/image/${manager._id}.${manager.image.extension || "jpg"}`
        : null;
      delete obj.image;
      return obj;
    });

    res.status(200).json({ message: "Managers fetched successfully", data });
  } catch (error) {
    console.error("Fetch managers error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ------------------- Get Single Manager -------------------
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

    const obj = manager.toObject();
    obj.image_url = manager.image?.data
      ? `/api/managers/image/${manager._id}.${manager.image.extension || "jpg"}`
      : null;
    delete obj.image;

    res.status(200).json({ message: "Manager fetched successfully", data: obj });
  } catch (error) {
    console.error("Get manager error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ------------------- Update Manager -------------------
router.put("/:id", upload.single("image"), async (req, res) => {
  const { id } = req.params;
  const { salon_id, ...rest } = req.body;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const updateData = { ...rest };

    if (req.file) {
      updateData.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: req.file.originalname,
        extension: req.file.originalname.split(".").pop()
      };
    }
    const updatedManager = await Manager.findOneAndUpdate(
      { _id: id, salon_id },
      updateData,
      { new: true }
    );

    if (!updatedManager) {
      return res.status(404).json({ message: "Manager not found" });
    }

    const obj = updatedManager.toObject();
    obj.image_url = updatedManager.image?.data
      ? `/api/managers/image/${updatedManager._id}.${updatedManager.image?.extension || "jpg"}`
      : null;
    delete obj.image;

    res.status(200).json({
      message: "Manager updated successfully",
      data: obj,
    });
  } catch (error) {
    console.error("Update manager error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ------------------- Delete Manager -------------------
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
    console.error("Delete manager error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

module.exports = router;