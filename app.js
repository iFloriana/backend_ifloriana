const express = require("express");
const cors = require("cors");
const path = require("path");
const app = express();

// ✅ Proper CORS setup
app.use(cors({
    origin: [ 
        "https://admin.ifloriana.com",    // Admin frontend
        "https://superadmin.ifloriana.com", // Superadmin frontend
    ],
    credentials: true,
}));
app.options('*', cors());

// Serve uploads as static files for invoice download
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

// Static folder for image access
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ Parsing middleware
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));

// ✅ Simple health check route
app.get("/", (req, res) => {
  res.send("Salon Admin API is running");
});

module.exports = app;