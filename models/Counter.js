const mongoose = require ("mongoose");

const CounterSchema = new mongoose.Schema ({
    _id: {
        type: String,
        required: true
    },
    sequence_value: {
        type: Number,
        default: 0,
    },
});

module.exports = mongoose.model("Counter", CounterSchema);