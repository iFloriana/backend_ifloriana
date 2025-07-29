const multer = require("multer");
const path = require("path");

/**
 * Returns a configured multer instance for a specific subdirectory
 * @params {string} folderName - folder name inside uploads/ (e.g., "branch_images")
 */
function getUploader(folderName) {
    const storage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, `./uploads/${folderName}`);
        },
        filename: function (req, file, cb) {
            cb(null, `${Date.now()}-${file.originalname}`);
        },
    });

    const fileFilter = (req, file, cb) => {
        const allowedTypes = [".jpg", ".jpeg", ".png"];
        const ext = path.extname(file.originalname).toLowerCase();
        if(allowedTypes.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error("Only .jpg, .jpeg, .png formats are allowed!"), false);
        }
    };
    return multer({ 
        storage, 
        fileFilter,
        limits: { fileSize: 150 * 1024 } // 150 KB 
    });
}

module.exports = getUploader;