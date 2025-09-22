const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
    {
        salon_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Salon",
            required: true,
        },
        branch_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Branch",
            required: true,
        },
        type: {
            type: String,
            enum: [
                "add_expense",
                "deposit_to_owner_account",
                "vendor_pay",
                "receive_from_owner_account",
            ],
            required: true,
        },
        category: {
            type: String,
            enum: [
                "Food & Drinks",
                "Maintenance",
                "Cleaning",
                "Salon Equipments",
                "Other"
            ],
        },
        vendor_name: {
            type: String,
            trim: true,
        },
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        notes: {
            type: String,
            trim: true,
        },
        date: {
            type: Date,
            default: Date.now,
        },
        image: {
            data: Buffer,
            contentType: String,
            originalName: String,
            extension: String,
        },
    },
    { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

// === Conditional validation ===
expenseSchema.pre("validate", function (next) {
    if (this.type === "add_expense" && !this.category) {
        return next(new Error("Category is required for add_expense type"));
    }

    if (this.type === "vendor_pay" && !this.vendor_name) {
        return next(new Error("Vendor name is required for vendor_pay type"));
    }

    next();
});

module.exports = mongoose.model("Expense", expenseSchema);