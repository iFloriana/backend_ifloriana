const multer = require("multer");
const path = require("path");

/**
 * Returns a configured multer instance for a specific subdirectory
 * @params {string} folderName - folder name inside uploads/ (e.g., "branch_images")
 */

function getUploader() {
    const storage = multer.memoryStorage(); // store file in memory

    const fileFilter = (req, file, cb) => {
        const allowedExtensions = [".jpg", ".jpeg", ".png"];
        const allowedMimeTypes = ["image/jpeg", "image/png"];

        const ext = path.extname(file.originalname).toLowerCase();
        const mime = file.mimetype;

        if (allowedExtensions.includes(ext) && allowedMimeTypes.includes(mime)) {
            cb(null, true);
        } else {
            cb(new Error("Only .jpg, .png, .jpeg formats are allowed!"), false);
        }
    };

    return multer({
        storage,
        fileFilter,
        limits: { fileSize: 150 * 1024 }, // 150 kB
    });
}

module.exports = getUploader;