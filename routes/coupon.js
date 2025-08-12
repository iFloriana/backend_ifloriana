const express = require("express");
const Coupon = require("../models/Coupon");
const router = express.Router();
const mongoose = require("mongoose");
const getUploader = require("../middleware/imageUpload");
const upload = getUploader();
const path = require("path");

// ------------------- Create Coupon -------------------
router.post("/", upload.single("image"), async (req, res) => {
  const {
    name,
    branch_id,
    description,
    start_date,
    end_date,
    coupon_type,
    coupon_code,
    discount_type,
    discount_amount,
    use_limit,
    status,
    salon_id,
  } = req.body;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {

    const image = req.file
      ? {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: req.file.originalname,
        extension: path.extname(req.file.originalname).slice(1)
      }
      : undefined;

    const newCoupon = new Coupon({
      salon_id,
      name,
      branch_id,
      description,
      start_date,
      end_date,
      coupon_type,
      coupon_code,
      discount_type,
      discount_amount,
      use_limit,
      status,
      image,
    });

    await newCoupon.save();

    res.status(201).json({
      message: "Coupon created successfully",
      data: newCoupon
    });
  } catch (error) {
    console.error("Create coupon error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ------------------- Get All Coupons -------------------
router.get("/", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const coupons = await Coupon.find({ salon_id }).populate("branch_id");

    const data = coupons.map((coupon) => {
      const obj = coupon.toObject();
      obj.image_url = coupon.image?.data
        ? `/api/coupons/image/${coupon._id}.${coupon.image.extension || "jpg"}`
        : null;
      delete obj.image;
      return obj;
    });

    res.status(200).json({ message: "Coupons fetched successfully", data });
  } catch (error) {
    console.error("Get all coupons error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ------------------- Get Coupons by Branch -------------------
router.get("/by-branch", async (req, res) => {
  const { salon_id, branch_id } = req.query;

  if (!salon_id || !branch_id) {
    return res.status(400).json({ message: "salon_id and branch_id are required" });
  }

  try {
    const coupons = await Coupon.find({
      salon_id: new mongoose.Types.ObjectId(salon_id),
      branch_id: new mongoose.Types.ObjectId(branch_id),
    }).populate({
      path: "branch_id",
      match: { _id: new mongoose.Types.ObjectId(branch_id) },
      select: "_id name",
    });

    const data = coupons.map((coupon) => {
      const obj = coupon.toObject();
      obj.image_url = coupon.image?.data
        ? `/api/coupons/image/${coupon._id}.${coupon.image.extension || "jpg"}`
        : null;
      delete obj.image;
      return obj;
    });

    res.status(200).json({ message: "Coupons fetched successfully", data });
  } catch (error) {
    console.error("Get coupons by branch error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ------------------- Get Single Coupon -------------------
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const coupon = await Coupon.findOne({ _id: id, salon_id }).populate("branch_id");
    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    const obj = coupon.toObject();
    obj.image_url = coupon.image?.data
      ? `/api/coupons/image/${coupon._id}.${coupon.image.extension || "jpg"}`
      : null;
    delete obj.image;

    res.status(200).json({ message: "Coupon fetched successfully", data: obj });
  } catch (error) {
    console.error("Get single coupon error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ------------------- Update Coupon -------------------
router.put("/:id", upload.single("image"), async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.body;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  const updateData = { ...req.body };

  if (req.file) {
    updateData.image = {
      data: req.file.buffer,
      contentType: req.file.mimetype,
      originalName: req.file.originalname,
      extension: req.file.originalname.split(".").pop()
    };
  }

  try {
    const updatedCoupon = await Coupon.findOneAndUpdate(
      { _id: id, salon_id },
      updateData,
      { new: true }
    );

    if (!updatedCoupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }

    const obj = updatedCoupon.toObject();
    obj.image_url = updatedCoupon.image?.data ? `/api/coupons/image/${updatedCoupon._id}.${updatedCoupon.image?.extension || "jpg"}` : null;
    delete obj.image;

    res.status(200).json({ message: "Coupon updated successfully", data: obj });
  } catch (error) {
    console.error("Update coupon error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// ------------------- Serve Coupon Image -------------------
router.get("/image/:filename", async (req, res) => {
  try {
    const id = req.params.filename.split(".")[0];

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Coupon ID" });
    }

    const coupon = await Coupon.findById(id);
    if (!coupon?.image?.data) {
      return res.status(404).json({ message: "Image not found" });
    }

    const contentType = coupon.image.contentType || "image/jpeg";
    res.type(contentType);
    res.set("Content-Disposition", "inline");

    res.send(Buffer.from(coupon.image.data));
  } catch (error) {
    console.error("Image fetch error: ", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// ------------------- Delete Coupon -------------------
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const deletedCoupon = await Coupon.findOneAndDelete({ _id: id, salon_id });
    if (!deletedCoupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }
    res.status(200).json({ message: "Coupon deleted successfully" });
  } catch (error) {
    console.error("Delete coupon error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;