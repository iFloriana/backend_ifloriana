const express = require("express");
const router = express.Router();
const Expense = require("../models/Expense");
const ExpenseBalance = require("../models/ExpenseBalance");
const getUploader = require("../middleware/imageUpload");
const upload = getUploader();
const mongoose = require("mongoose");
const path = require("path");

// === Set Opening Balance ===
router.post("/opening-balance", async (req, res) => {
    try {
        const { salon_id, branch_id, opening_balance } = req.body;

        let balance = await ExpenseBalance.findOne({ salon_id, branch_id });

        if (balance) {
            balance.opening_balance = opening_balance;
            balance.updated_at = new Date();
            await balance.save();
        } else {
            balance = await ExpenseBalance.create({ salon_id, branch_id, opening_balance });
        }

        res.json({ success: true, balance });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ----------------- GET: Get Opening Balance --------------------
router.get("/opening-balance", async (req, res) => {
    try {
        const { salon_id, branch_id } = req.query;

        if (!salon_id || !branch_id) {
            return res.status(400).json({ message: "salon_id and branch_id are required" });
        }

        let balance = await ExpenseBalance.findOne({ salon_id, branch_id })
            .populate("salon_id")
            .populate("branch_id");

        if (!balance) {
            return res.status(404).json({ message: "Opening balance not set for this branch" });
        }

        // convert mongoose doc to plain object
        let obj = balance.toObject();

        // === Transform salon image ===
        if (obj.salon_id?.image?.data) {
            const ext = obj.salon_id.image.extension || "jpg";
            obj.salon_id.image_url = `/api/salons/image/${obj.salon_id._id}.${ext}`;
            delete obj.salon_id.image; // ✅ remove raw buffer
        }

        // === Transform branch image ===
        if (obj.branch_id?.image?.data) {
            const ext = obj.branch_id.image.extension || "jpg";
            obj.branch_id.image_url = `/api/branches/image/${obj.branch_id._id}.${ext}`;
            delete obj.branch_id.image; // ✅ remove raw buffer
        }

        res.json({ success: true, balance: obj });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// PUT: Update Opening Balance by ID
router.put("/opening-balance/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { opening_balance } = req.body;

        if (!id) {
            return res.status(400).json({ message: "Balance ID is required" });
        }

        const balance = await ExpenseBalance.findByIdAndUpdate(
            id,
            { opening_balance, updated_at: new Date() },
            { new: true }
        );

        if (!balance) {
            return res.status(404).json({ message: "Opening balance not found" });
        }

        res.json({ success: true, balance });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// 🔹 Helper to format images
function formatImage(doc, type) {
    if (!doc) return doc;
    const obj = doc.toObject ? doc.toObject() : { ...doc };

    if (obj.image?.data) {
        const ext = obj.image.extension || "jpg";
        obj.image_url = `/api/${type}/image/${obj._id}.${ext}`;
    } else {
        obj.image_url = null;
    }

    delete obj.image; // ✅ remove raw buffer
    return obj;
}

// post request to add expense
router.post("/", upload.single("image"), async (req, res) => {
    try {
        const {
            salon_id,
            branch_id,
            type,
            category,
            vendor_name,
            amount,
            notes,
            date,
        } = req.body;

        // Check for opening balance
        let balance = await ExpenseBalance.findOne({ salon_id, branch_id });
        if (!balance) {
            return res
                .status(400)
                .json({ success: false, message: "Opening balance not set." });
        }

        // === Conditional validation ===
        if (type === "add_expense" && !category) {
            return res.status(400).json({
                success: false,
                message: "Category is required when type is add_expense",
            });
        }
        if (type === "vendor_pay" && !vendor_name) {
            return res.status(400).json({
                success: false,
                message: "Vendor name is required when type is vendor_pay",
            });
        }

        // Build expense object
        const expenseData = {
            salon_id,
            branch_id,
            type,
            category,
            vendor_name,
            amount,
            notes,
            date: date ? new Date(date) : Date.now(),
        };

        if (req.file) {
            expenseData.image = {
                data: req.file.buffer,
                contentType: req.file.mimetype,
                originalName: req.file.originalname,
                extension: path.extname(req.file.originalname).slice(1),
            };
        }

        const expense = new Expense(expenseData);
        await expense.save();

        // Update balance
        if (["add_expense", "deposit_to_owner_account", "vendor_pay"].includes(type)) {
            balance.opening_balance -= Number(amount);
        } else if (type === "receive_from_owner_account") {
            balance.opening_balance += Number(amount);
        }
        balance.updated_at = new Date();
        await balance.save();

        let expenseObj = expense.toObject();
        if (expenseObj.image?.data) {
            const ext = expenseObj.image.extension || "jpg";
            expenseObj.image_url = `/api/expenses/image/${expenseObj._id}.${ext}`;
        } else {
            expenseObj.image_url = null;
        }
        delete expenseObj.image;

        res.json({ success: true, expense: expenseObj, balance });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ----------------- GET: Serve Expense Image --------------------
router.get("/image/:id.:ext", async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid Expense ID" });
        }

        const expense = await Expense.findById(id);
        if (!expense?.image?.data) {
            return res.status(404).json({ message: "Image not found" });
        }

        res.set("Content-Type", expense.image.contentType || "image/jpeg");
        res.set("Content-Disposition", "inline");
        res.send(Buffer.from(expense.image.data));
    } catch (err) {
        console.error("Fetch expense image error:", err);
        res.status(500).json({ message: "Server error" });
    }
});

// ----------------- GET: All Expenses (Grouped by Date) --------------------
router.get("/", async (req, res) => {
    try {
        const { salon_id, branch_id } = req.query;

        // ✅ Require salon_id
        if (!salon_id) {
            return res.status(400).json({ message: "salon_id is required" });
        }

        // ✅ Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(salon_id)) {
            return res.status(400).json({ message: "Invalid salon_id" });
        }

        // ✅ Build query
        const query = { salon_id };
        if (branch_id) {
            if (!mongoose.Types.ObjectId.isValid(branch_id)) {
                return res.status(400).json({ message: "Invalid branch_id" });
            }
            query.branch_id = branch_id;
        }

        const expenses = await Expense.find(query)
            .populate("salon_id")
            .populate("branch_id") // ✅ also populate branch_id
            .sort({ created_at: -1 })
            .lean();

        // ✅ Format & group by date
        const groupedExpenses = {};
        expenses.forEach((exp) => {
            // ✅ Salon image
            exp.salon_id = formatImage(exp.salon_id, "salons");

            // ✅ Branch image → convert to image_url
            if (exp.branch_id) {
                const branch = exp.branch_id;
                if (branch.image?.data) {
                    const ext = branch.image.extension || "jpg";
                    branch.image_url = `/api/salons/image/${branch._id}.${ext}`;
                } else {
                    branch.image_url = null;
                }
                delete branch.image;
                exp.branch_id = branch;
            }

            // ✅ Expense image
            if (exp.image?.data) {
                const ext = exp.image.extension || "jpg";
                exp.image_url = `/api/expenses/image/${exp._id}.${ext}?salon_id=${salon_id}`;
            } else {
                exp.image_url = null;
            }
            delete exp.image;

            // ✅ Normalize to YYYY-MM-DD
            const dateKey = exp.date
                ? new Date(exp.date).toISOString().split("T")[0]
                : "unknown";

            if (!groupedExpenses[dateKey]) {
                groupedExpenses[dateKey] = [];
            }
            groupedExpenses[dateKey].push(exp);
        });

        res.status(200).json({ success: true, data: groupedExpenses });
    } catch (error) {
        console.error("Error fetching expenses:", error);
        res.status(500).json({ message: "Error fetching expenses", error: error.message });
    }
});

// ----------------- GET: Expenses by Branch (Grouped by Date) --------------------
router.get("/by-branch", async (req, res) => {
    try {
        const { salon_id, branch_id } = req.query;
        if (!salon_id || !branch_id) {
            return res.status(400).json({ message: "salon_id and branch_id are required" });
        }

        const expenses = await Expense.find({ salon_id, branch_id })
            .populate("salon_id")
            .populate("branch_id")
            .sort({ created_at: -1 })
            .lean();

        // Format & group by date
        const groupedExpenses = {};
        expenses.forEach((exp) => {
            exp.salon_id = formatImage(exp.salon_id, "salons");
            exp.branch_id = formatImage(exp.branch_id, "branches");

            if (exp.image?.data) {
                const ext = exp.image.extension || "jpg";
                exp.image_url = `/api/expenses/image/${exp._id}.${ext}`;
            } else {
                exp.image_url = null;
            }
            delete exp.image;

            // Normalize date to YYYY-MM-DD
            const dateKey = exp.date
                ? new Date(exp.date).toISOString().split("T")[0]
                : "unknown";

            if (!groupedExpenses[dateKey]) {
                groupedExpenses[dateKey] = [];
            }
            groupedExpenses[dateKey].push(exp);
        });

        res.status(200).json({ success: true, data: groupedExpenses });
    } catch (error) {
        res.status(500).json({ message: "Error fetching expenses by branch", error: error.message });
    }
});

// ----------------- GET: Single Expense --------------------
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid expense ID" });
        }

        let expense = await Expense.findById(id)
            .populate("salon_id")
            .populate("branch_id")
            .lean();

        if (!expense) {
            return res.status(404).json({ message: "Expense not found" });
        }

        expense.salon_id = formatImage(expense.salon_id, "salons");
        expense.branch_id = formatImage(expense.branch_id, "branches");

        if (expense.image?.data) {
            const ext = expense.image.extension || "jpg";
            expense.image_url = `/api/expenses/image/${expense._id}.${ext}`;
        } else {
            expense.image_url = null;
        }
        delete expense.image;

        expense.date = expense.date ? new Date(expense.date).toISOString() : null;

        res.status(200).json({ success: true, expense });
    } catch (error) {
        res.status(500).json({ message: "Error fetching expense", error: error.message });
    }
});

// ----------------- PUT: Update Expense --------------------
router.put("/:id", upload.single("image"), async (req, res) => {
    try {
        const { id } = req.params;
        const {
            type,
            category,
            vendor_name,
            amount,
            notes,
            date,
        } = req.body;

        const expense = await Expense.findById(id);
        if (!expense) {
            return res.status(404).json({ success: false, message: "Expense not found" });
        }

        // === Conditional validation ===
        if (type === "add_expense" && !category) {
            return res.status(400).json({
                success: false,
                message: "Category is required when type is add_expense",
            });
        }
        if (type === "vendor_pay" && !vendor_name) {
            return res.status(400).json({
                success: false,
                message: "Vendor name is required when type is vendor_pay",
            });
        }

        // Rollback old balance effect before applying new one
        let balance = await ExpenseBalance.findOne({
            salon_id: expense.salon_id,
            branch_id: expense.branch_id,
        });
        if (!balance) {
            return res.status(400).json({ success: false, message: "Opening balance not set." });
        }

        // rollback old transaction
        if (["add_expense", "deposit_to_owner_account", "vendor_pay"].includes(expense.type)) {
            balance.opening_balance += Number(expense.amount);
        } else if (expense.type === "receive_from_owner_account") {
            balance.opening_balance -= Number(expense.amount);
        }

        // apply new changes
        expense.type = type || expense.type;
        expense.category = category || expense.category;
        expense.vendor_name = vendor_name || expense.vendor_name;
        expense.amount = amount !== undefined ? amount : expense.amount;
        expense.notes = notes || expense.notes;
        expense.date = date ? new Date(date) : expense.date;

        if (req.file) {
            expense.image = {
                data: req.file.buffer,
                contentType: req.file.mimetype,
                originalName: req.file.originalname,
                extension: path.extname(req.file.originalname).slice(1),
            };
        }

        await expense.save();

        // apply new balance effect
        if (["add_expense", "deposit_to_owner_account", "vendor_pay"].includes(expense.type)) {
            balance.opening_balance -= Number(expense.amount);
        } else if (expense.type === "receive_from_owner_account") {
            balance.opening_balance += Number(expense.amount);
        }
        balance.updated_at = new Date();
        await balance.save();

        let expenseObj = expense.toObject();
        if (expenseObj.image?.data) {
            const ext = expenseObj.image.extension || "jpg";
            expenseObj.image_url = `/api/expenses/image/${expenseObj._id}.${ext}`;
        } else {
            expenseObj.image_url = null;
        }
        delete expenseObj.image;

        res.json({ success: true, expense: expenseObj, balance });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ----------------- DELETE: Remove Expense --------------------
router.delete("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        let expense = await Expense.findById(id);
        if (!expense) {
            return res.status(404).json({ success: false, message: "Expense not found" });
        }

        let balance = await ExpenseBalance.findOne({ salon_id: expense.salon_id, branch_id: expense.branch_id });
        if (!balance) {
            return res.status(400).json({ success: false, message: "Opening balance not set." });
        }

        // === Revert expense effect before deleting ===
        if (["add_expense", "deposit_to_owner_account", "vendor_pay"].includes(expense.type)) {
            balance.opening_balance += Number(expense.amount);
        } else if (expense.type === "receive_from_owner_account") {
            balance.opening_balance -= Number(expense.amount);
        }
        balance.updated_at = new Date();
        await balance.save();

        await expense.deleteOne();

        res.json({ success: true, message: "Expense deleted successfully", balance });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

module.exports = router;