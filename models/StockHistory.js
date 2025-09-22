const mongoose = require("mongoose");

const StockHistorySchema = new mongoose.Schema({
    product_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
    },
    product_name: {
        type: String,
        required: true,
    },
    quantity_received: {
        type: Number,
        required: true,
    },
    date: {
        type: Date,
        default: Date.now,
    },
}, { timestamps: true });

module.exports = mongoose.model("StockHistory", StockHistorySchema);