const express = require('express');
const router = express.Router();
const Staff = require('../models/Staff');
const RevenueCommission = require('../models/RevenueCommission');
const Payment = require('../models/Payment');
const StaffPayout = require('../models/StaffPayout');

// Create a new staff payout
router.post('/', async (req, res) => {
    try {
        const { staff_id, select_method, description, date } = req.body;

        const staff = await Staff.findById(staff_id);
        if (!staff) {
            return res.status(404).json({ message: 'Staff not found' });
        }

        // Find revenue commission for the staff's branch
        const commissionDoc = await RevenueCommission.findOne({ branch_id: staff.branch_id });

        let commissionAmount = 0;
        if (commissionDoc && commissionDoc.commission.length > 0) {
            // Assuming we use the first available slot for simplicity
            const { type, commission } = commissionDoc;
            const slotCommission = commission[0]; // You can match by slot name/date/time etc.

            if (type === 'flat') {
                commissionAmount = slotCommission.amount;
            } else if (type === 'percent') {
                // If you want to calculate on revenue, replace `revenue` with actual logic
                const revenue = 10000; // Example fixed revenue value
                commissionAmount = (slotCommission.amount / 100) * revenue;
            }
        }

        // Get tips
        const tipsData = await Payment.findOne({ staff_id });
        const tipsAmount = tipsData?.tips || 0;

        // Salary
        const salary = staff.salary || 0;

        const total_pay = commissionAmount + tipsAmount + salary;

        if (!description) {
            return res.status(400).json({ message: 'Description is required' });
        }

        const newPayout = await StaffPayout.create({
            staff_id,
            select_method,
            description,
            date,
            commission: commissionAmount,
            tips: tipsAmount,
            salary,
            total_pay,
        });

        res.status(201).json({ message: 'Staff payout created successfully', data: newPayout });
    } catch (error) {
        console.error('Error creating staff payout:', error);
        res.status(500).json({ message: 'Error creating staff payout', error });
    }
});

// Get all staff payouts
router.get('/', async (req, res) => {
    try {
        const payouts = await StaffPayout.find()
            .populate('staff_id', 'name image') // fetch image too
            .lean();

        const processed = payouts.map(payout => {
            if (payout.staff_id) {
                payout.staff_id.image_url = payout.staff_id.image?.data
                    ? `/api/staffs/image/${payout.staff_id._id}.${payout.staff_id.image.extension || 'jpg'}`
                    : null;
                delete payout.staff_id.image; // remove buffer
            }
            return payout;
        });

        res.status(200).json({
            message: 'Staff payouts fetched successfully',
            data: processed
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching staff payouts', error });
    }
});

// Get a single staff payout
router.get('/:id', async (req, res) => {
    try {
        const payout = await StaffPayout.findById(req.params.id)
            .populate('staff_id', 'name image')
            .lean();

        if (!payout) {
            return res.status(404).json({ message: 'Staff payout not found' });
        }

        if (payout.staff_id) {
            payout.staff_id.image_url = payout.staff_id.image?.data
                ? `/api/staffs/image/${payout.staff_id._id}.${payout.staff_id.image.extension || 'jpg'}`
                : null;
            delete payout.staff_id.image;
        }

        res.status(200).json({
            message: 'Staff payout fetched successfully',
            data: payout
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching staff payout', error });
    }
});

// Update a staff payout
router.put('/:id', async (req, res) => {
    try {
        const updatedPayout = await StaffPayout.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!updatedPayout) return res.status(404).json({ message: 'Staff payout not found' });
        res.status(200).json({ message: 'Staff payout updated successfully', data: updatedPayout });
    } catch (error) {
        res.status(500).json({ message: 'Error updating staff payout', error });
    }
});

// Delete a staff payout
router.delete('/:id', async (req, res) => {
    try {
        const deletedPayout = await StaffPayout.findByIdAndDelete(req.params.id);
        if (!deletedPayout) return res.status(404).json({ message: 'Staff payout not found' });
        res.status(200).json({ message: 'Staff payout deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting staff payout', error });
    }
});

module.exports = router;