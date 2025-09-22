const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");
const SuperAdminPackage = require("../models/SuperAdminPackage");
const Salon = require("../models/Salon");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const getUploader = require("../middleware/imageUpload");
const upload = getUploader();
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config();

// Nodemailer setup
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // true for port 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Temporary storage for password reset tokens
const resetTokenStore = {};

router.get("/image/:filename", async (req, res) => {
  try {
    const id = req.params.filename.split(".")[0];
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Salon ID" });
    }

    const salon = await Salon.findById(id);
    if (!salon?.image?.data) {
      return res.status(404).json({ message: "Image not found" });
    }

    res.set("Content-Type", salon.image.contentType || "image/jpeg");
    res.set("Content-Disposition", "inline");
    res.send(Buffer.from(salon.image.data));
  } catch (error) {
    console.error("Salon image fetch error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Check if email already exists
router.get("/check-email", async (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
    res.status(200).json({ exists: !!existingAdmin });
  } catch (error) {
    console.error("Error checking Email: ", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Signup Route
router.post("/signup", async (req, res) => {
  try {
    const {
      full_name,
      phone_number,
      email,
      address,
      package_id,
      salonDetails,
    } = req.body;

    if (!full_name || !phone_number || !email || !address || !package_id) {
      return res.status(400).json({ message: "All fields are required." });
    }

    const parsedSalonDetails =
      typeof salonDetails === "string"
        ? (() => {
          try {
            return JSON.parse(salonDetails);
          } catch (error) {
            console.error("Error parsing salonDetails:", error);
            return { salon_name: "Unnamed Salon" };
          }
        })()
        : salonDetails || { salon_name: "Unnamed Salon" };

    // Check for existing admin
    const existingAdmin = await Admin.findOne({
      $or: [{ email }, { phone_number }],
    });

    if (existingAdmin) {
      return res
        .status(400)
        .json({ message: "Admin with this email or phone number already exists" });
    }

    // ✅ Handle package_id as string or array
    let selectedPackageId = Array.isArray(package_id) ? package_id[0] : package_id;

    // Check package existence
    const packageExists = await SuperAdminPackage.findById(selectedPackageId);
    if (!packageExists) {
      return res.status(404).json({ message: "Package not found" });
    }

    // Calculate package dates
    const packageStartDate = new Date();
    let packageExpirationDate = new Date(packageStartDate);

    switch (packageExists.subscription_plan) {
      case "15-days":
        packageExpirationDate.setDate(packageExpirationDate.getDate() + 15);
        break;
      case "1-month":
        packageExpirationDate.setMonth(packageExpirationDate.getMonth() + 1);
        break;
      case "3-months":
        packageExpirationDate.setMonth(packageExpirationDate.getMonth() + 3);
        break;
      case "6-months":
        packageExpirationDate.setMonth(packageExpirationDate.getMonth() + 6);
        break;
      case "1-year":
        packageExpirationDate.setFullYear(packageExpirationDate.getFullYear() + 1);
        break;
      default:
        return res.status(400).json({ message: "Invalid subscription plan" });
    }

    // Generate and hash password
    const password = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(password, 10);

    // Save admin with package history array
    const newAdmin = new Admin({
      full_name,
      phone_number,
      email,
      address,
      password: hashedPassword,
      package_id: [
        {
          package_id: selectedPackageId,
          package_start_date: packageStartDate,
          package_expiration_date: packageExpirationDate,
          status: 1,
        },
      ],
    });

    await newAdmin.save();

    // Save related salon (include gst_number and other details)
    const newSalon = new Salon({
      salon_name: parsedSalonDetails.salon_name || "Unnamed Salon",
      gst_number: parsedSalonDetails.gst_number || "",
      address: parsedSalonDetails.address || "",
      contact_number: parsedSalonDetails.contact_number || "",
      contact_email: parsedSalonDetails.contact_email || "",
      description: parsedSalonDetails.description || "",
      opening_time: parsedSalonDetails.opening_time || "",
      closing_time: parsedSalonDetails.closing_time || "",
      category: parsedSalonDetails.category || "unisex",
      status: parsedSalonDetails.status ?? 1,
      package_id: selectedPackageId,
      signup_id: newAdmin._id,
    });

    await newSalon.save();

    // Send email
    const signupMailText = `Hello,

Thank you for signing up with ifloriana Booking & Management software. 
Your account has been successfully created!

Here are your login details:
🔹 Username/Email: ${email}
🔹 Password: ${password}

First Steps:
Log in here: www.admin.ifloriana.com

Change your password after first login for security.

Need Help?
Contact our support team at ifloriana2025@gmail.com.

Thanks
Team IIPL
IFLORA INFO PVT. LTD.`;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Account successfully created! - Here's your login info",
      text: signupMailText,
    });

    res.status(201).json({
      message: "Admin and salon created successfully",
      admin: newAdmin,
      salon: newSalon,
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// patch request for updating package of admin
router.patch("/renew-package/:adminId", async (req, res) => {
  try {
    const { adminId } = req.params;
    let { package_id } = req.body;

    if (!package_id) {
      return res.status(400).json({ message: "Package ID is required" });
    }

    // ✅ If array, take the first element
    if (Array.isArray(package_id)) {
      package_id = package_id[0];
    }

    // ✅ validate admin
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    // ✅ validate package
    const packageExists = await SuperAdminPackage.findById(package_id);
    if (!packageExists) {
      return res.status(404).json({ message: "Package not found" });
    }

    // ✅ calculate new package dates
    const packageStartDate = new Date();
    let packageExpirationDate = new Date(packageStartDate);

    switch (packageExists.subscription_plan) {
      case "15-days":
        packageExpirationDate.setDate(packageExpirationDate.getDate() + 15);
        break;
      case "1-month":
        packageExpirationDate.setMonth(packageExpirationDate.getMonth() + 1);
        break;
      case "3-months":
        packageExpirationDate.setMonth(packageExpirationDate.getMonth() + 3);
        break;
      case "6-months":
        packageExpirationDate.setMonth(packageExpirationDate.getMonth() + 6);
        break;
      case "1-year":
        packageExpirationDate.setFullYear(packageExpirationDate.getFullYear() + 1);
        break;
      default:
        return res.status(400).json({ message: "Invalid subscription plan" });
    }

    // ✅ ensure array exists, then push
    if (!Array.isArray(admin.package_id)) {
      admin.package_id = [];
    }

    admin.package_id.push({
      package_id,
      package_start_date: packageStartDate,
      package_expiration_date: packageExpirationDate,
      status: 1
    });

    await admin.save();

    res.status(200).json({
      message: "Package renewed successfully",
      admin,
    });
  } catch (error) {
    console.error("Renew Package error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
});

// Check Admin Package Status
router.get("/check-package-status/:email", async (req, res) => {
  const { email } = req.params;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    const admin = await Admin.findOne({ email }).populate("package_id.package_id");

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    if (!admin.package_id || admin.package_id.length === 0) {
      return res.status(400).json({ message: "No package history found" });
    }

    // ✅ Always use the latest package entry
    const latestPackage = admin.package_id[admin.package_id.length - 1];

    const startDate = latestPackage.package_start_date;
    const endDate = latestPackage.package_expiration_date;

    const currentDate = new Date();
    const remainingTime = endDate - currentDate;
    const remainingDays = Math.ceil(remainingTime / (1000 * 60 * 60 * 24));

    res.status(200).json({
      message: "Package status fetched successfully",
      package: latestPackage.package_id,
      start_date: startDate,
      expiration_date: endDate,
      remaining_days: remainingDays >= 0 ? remainingDays : 0,
      expired: remainingDays < 0
    });
  } catch (error) {
    console.error("Error checking package status: ", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Login Route
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  // Debug log
  console.log("Request body:", req.body);

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid Credentials" });
    }

    const salon = await Salon.findOne({ signup_id: admin._id });

    const token = jwt.sign({ id: admin._id }, "secretKey", {
      expiresIn: "1h",
    });

    return res.status(201).json({
      message: "Login successful",
      token,
      full_name: admin.full_name,
      email: admin.email,
      phone_number: admin.phone_number,
      address: admin.address,
      package_id: admin.package_id, // just returned, no expiry logic
      admin_id: admin._id,
      salon_id: salon ? salon._id : null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Get All Admins
router.get("/admins", async (req, res) => {
  try {
    const admins = await Admin.find()
      .select("-password")
      .populate({ path: "package_id", model: "SuperAdminPackage" })
      .lean();
    // Add created_at from createdAt field
    const adminsWithCreatedAt = admins.map(a => ({
      ...a,
      created_at: a.createdAt
    }));
    res.json({ message: "Admins fetched successfully", data: adminsWithCreatedAt });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Forgot Password
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  try {
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(404).json({ message: "Email not found" });
    }


    // Generate a token and store it for the email
    const resetToken = crypto.randomBytes(32).toString("hex");
    resetTokenStore[email] = resetToken;

    // Send reset link with token and email as query params
    const resetLink = `http://localhost:5173/password-reset?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(email)}`;
    const mailText = `Hello,

You recently requested to reset your password for your ifloriana booking & management software. If you did not make this request, please ignore this email.

To reset your password, click the link below:

${resetLink}

For security reasons, this link will expire in 24 hours. If you need help, contact our support team at ifloriana2025@gmail.com.

Thanks,
Team IIPL
IFLORA INFO PVT. LTD`;
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset Request",
      text: mailText,
    });

    res.status(201).json({ message: "Password reset link sent to your email" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Reset Password
router.post("/reset-password-with-old", async (req, res) => {
  const { email, old_password, new_password, confirm_password } = req.body;

  if (new_password !== confirm_password) {
    return res.status(400).json({ message: "New passwords do not match" });
  }

  try {
    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(404).json({ message: "Email not found" });
    }

    // Verify old password
    const isMatch = await bcrypt.compare(old_password, admin.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Old password is incorrect" });
    }

    // Hash new password and update
    const hashedPassword = await bcrypt.hash(new_password, 10);
    admin.password = hashedPassword;
    await admin.save();

    res.status(201).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Reset Password - GET route to validate token
router.get("/reset-password", async (req, res) => {
  const { token, email } = req.query;

  if (!token || !email) {
    return res.status(400).json({ message: "Token and email are required" });
  }

  try {
    const storedToken = resetTokenStore[email];

    if (!storedToken || storedToken !== token) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    res.status(200).json({ message: "Token is valid" });
  } catch (error) {
    console.error("Error validating token: ", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Reset Password - POST route to update password (token required)
router.post("/reset-password", async (req, res) => {
  const { token, email, new_password, confirm_password } = req.body;

  if (!token || !email || !new_password || !confirm_password) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (new_password !== confirm_password) {
    return res.status(400).json({ message: "Passwords do not match" });
  }

  try {
    const storedToken = resetTokenStore[email];
    if (!storedToken || storedToken !== token) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    const hashedPassword = await bcrypt.hash(new_password, 10);
    admin.password = hashedPassword;
    await admin.save();

    // Remove the token after successful password reset
    delete resetTokenStore[email];

    res.status(201).json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Error resetting password: ", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Password Generator
const generateRandomPassword = (length = 10) => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

router.put("/update-admin/:id", upload.single("image"), async (req, res) => {
  const { id } = req.params;
  const { full_name, phone_number, email, address, salonDetails } = req.body;

  try {
    // 1️⃣ Check if admin exists
    const admin = await Admin.findById(id);
    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    // 2️⃣ Validate unique phone_number & email (excluding current admin)
    if (phone_number) {
      const existingPhone = await Admin.findOne({ phone_number, _id: { $ne: id } });
      if (existingPhone) {
        return res.status(400).json({ message: "Phone number already in use by another admin" });
      }
    }
    if (email) {
      const existingEmail = await Admin.findOne({ email, _id: { $ne: id } });
      if (existingEmail) {
        return res.status(400).json({ message: "Email already in use by another admin" });
      }
    }

    // 3️⃣ Update Admin basic details
    admin.full_name = full_name || admin.full_name;
    admin.phone_number = phone_number || admin.phone_number;
    admin.email = email || admin.email;
    admin.address = address || admin.address;
    await admin.save();

    // 4️⃣ Parse salonDetails (can be stringified JSON or object)
    let parsedSalonDetails = {};
    if (salonDetails) {
      parsedSalonDetails = typeof salonDetails === "string" ? JSON.parse(salonDetails) : salonDetails;
    }

    // 5️⃣ Find linked salon
    const salon = await Salon.findOne({ signup_id: admin._id });
    if (!salon) {
      return res.status(404).json({ message: "Salon not found" });
    }

    // 6️⃣ If image uploaded, store in MongoDB as buffer (centralized image logic)
    if (req.file) {
      parsedSalonDetails.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype,
        originalName: req.file.originalname,
        extension: path.extname(req.file.originalname).slice(1),
      };
    }

    // 7️⃣ Update salon fields
    Object.keys(parsedSalonDetails).forEach((key) => {
      salon[key] = parsedSalonDetails[key];
    });

    await salon.save();

    // 8️⃣ Prepare clean response with image_url instead of raw buffer
    const salonObj = salon.toObject();
    salonObj.image_url = salon.image?.data
      ? `/api/salons/image/${salon._id}.${salon.image?.extension || "jpg"}`
      : null;
    delete salonObj.image;

    res.status(200).json({
      message: "Admin and salon updated successfully",
      admin,
      salon: salonObj,
    });
  } catch (error) {
    console.error("Update Admin Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Delete Admin by ID
router.delete("/admins/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const deletedAdmin = await Admin.findByIdAndDelete(id);
    if (!deletedAdmin) {
      return res.status(404).json({ message: "Admin not found" });
    }
    res.json({ message: "Admin deleted successfully", admin: deletedAdmin });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;