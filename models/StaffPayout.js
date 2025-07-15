const mongoose = require('mongoose');

const StaffPayoutSchema = new mongoose.Schema({
    staff_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Staff',
        required: true
    },
    select_method: {
        type: String,
        enum: ['cash', 'wallet'],
        required: true
    },
    description: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    commission: {
        type: Number,
        required: true
    },
    tips: {
        type: Number,
        required: true
    },
    salary: {
        type: Number, 
        required: true
    },
    total_pay: {
        type: Number,
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.model('StaffPayout', StaffPayoutSchema);
