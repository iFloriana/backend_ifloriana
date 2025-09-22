const mongoose = require("mongoose");

const ExpenseBalanceSchema = new mongoose.Schema({
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
    opening_balance: {
        type: Number,
        required: true,
        default: 0,
    },
    updated_at: {
        type: Date,
        default: Date.now,
    },
});

module.exports = mongoose.model("ExpenseBalance", ExpenseBalanceSchema);