const express = require("express");
const router = express.Router();
const QuickBooking = require("../models/QuickBooking");
const Customer = require("../models/Customer");
const mongoose = require("mongoose");
const Appointment = require("../models/Appointment");
const Service = require("../models/Service");
const Staff = require("../models/Staff");

// GET /quick-booking/available-slots
router.get("/available-slots", async (req, res) => {
  try {
    const { salon_id, date, staff_id } = req.query;

    if (!salon_id || !date || !staff_id) {
      return res.status(400).json({ message: "salon_id, date, and staff_id are required" });
    }

    // 🕒 Fetch the staff's shift timing
    const staff = await Staff.findById(staff_id).lean();
    if (!staff || !staff.assign_time || !staff.assign_time.start_shift || !staff.assign_time.end_shift) {
      return res.status(404).json({ message: "Staff shift timing not found" });
    }

    // 🕓 Convert shift times to slots (30-minute intervals)
    const startShift = staff.assign_time.start_shift; 
    const endShift = staff.assign_time.end_shift;    

    const generateSlots = (startTime, endTime, intervalMinutes = 30) => {
      const slots = [];
      const [startHour, startMin] = startTime.split(":").map(Number);
      const [endHour, endMin] = endTime.split(":").map(Number);

      let current = new Date();
      current.setHours(startHour, startMin, 0, 0);

      const end = new Date();
      end.setHours(endHour, endMin, 0, 0);

      while (current <= end) {
        const hours = String(current.getHours()).padStart(2, "0");
        const minutes = String(current.getMinutes()).padStart(2, "0");
        slots.push(`${hours}:${minutes}`);
        current.setMinutes(current.getMinutes() + intervalMinutes);
      }
      return slots;
    };

    const allSlots = generateSlots(startShift, endShift);

    // 📅 Filter appointments by day
    const selectedDate = new Date(date);
    const startOfDay = new Date(selectedDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(selectedDate.setHours(23, 59, 59, 999));

    const appointments = await Appointment.find({
      salon_id,
      appointment_date: { $gte: startOfDay, $lte: endOfDay },
      "services.staff_id": staff_id
    }).lean();

    const bookedSlots = appointments.map(app => app.appointment_time);
    const availableSlots = allSlots.filter(slot => !bookedSlots.includes(slot));

    res.status(200).json({ availableSlots });
  } catch (error) {
    console.error("Error fetching available slots:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});

// Create a new quick booking
router.post("/", async (req, res) => {
  const { salon_id, ...bookingData } = req.body;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    // 1️⃣ Handle customer
    let customerId = bookingData.customer_id;
    if (!customerId) {
      const customerDetails = bookingData.customer_details;
      if (!customerDetails || !customerDetails.phone_number || !customerDetails.full_name) {
        return res.status(400).json({ message: "Customer details with full_name and phone_number are required" });
      }

      let customerQuery = {
        phone_number: customerDetails.phone_number,
        salon_id: salon_id
      };
      if (customerDetails.email) customerQuery.email = customerDetails.email;

      let existingCustomer = await Customer.findOne(customerQuery);
      if (!existingCustomer) {
        existingCustomer = await Customer.findOne({
          phone_number: customerDetails.phone_number,
          salon_id
        });
      }

      if (!existingCustomer) {
        const newCustomer = new Customer({
          full_name: customerDetails.full_name,
          phone_number: customerDetails.phone_number,
          gender: customerDetails.gender,
          salon_id,
          email: customerDetails.email || undefined
        });
        const savedCustomer = await newCustomer.save();
        customerId = savedCustomer._id;
      } else {
        customerId = existingCustomer._id;
      }
    }

    bookingData.customer_id = customerId;

    // 2️⃣ Validate and normalize staff/service data
    if (!Array.isArray(bookingData.staff_id)) bookingData.staff_id = [bookingData.staff_id];
    if (!Array.isArray(bookingData.service_id)) bookingData.service_id = [bookingData.service_id];

    bookingData.staff_id = bookingData.staff_id.map(id => new mongoose.Types.ObjectId(id));
    bookingData.service_id = bookingData.service_id.map(id => new mongoose.Types.ObjectId(id));

    if (!bookingData.date || !bookingData.time) {
      return res.status(400).json({ message: "Both date and time are required" });
    }

    if (!bookingData.branch_id) {
      return res.status(400).json({ message: "branch_id is required" });
    }

    // 3️⃣ Save QuickBooking
    const quickBooking = new QuickBooking({ salon_id, ...bookingData });
    const savedQuickBooking = await quickBooking.save();

    // 4️⃣ Create corresponding Appointment
    const services = [];
    let total_payment = 0;

    for (let i = 0; i < bookingData.service_id.length; i++) {
      const serviceDoc = await Service.findById(bookingData.service_id[i]);
      const amount = serviceDoc?.regular_price || 0;

      services.push({
        service_id: bookingData.service_id[i],
        staff_id: bookingData.staff_id[i] || null,
        service_amount: amount,
        used_package: false,
        package_id: null
      });

      total_payment += amount;
    }

    const appointment = new Appointment({
      salon_id,
      customer_id: customerId,
      branch_id: bookingData.branch_id,
      appointment_date: new Date(bookingData.date),
      appointment_time: bookingData.time,
      services,
      products: [],
      total_payment,
      grand_total: total_payment,
      status: "upcoming"
    });

    const savedAppointment = await appointment.save();

    // ✅ Done
    return res.status(201).json({
      message: "Quick booking and appointment created successfully",
      quickBooking: savedQuickBooking,
      appointment: savedAppointment
    });
  } catch (err) {
    console.error("Error in quick-booking:", err);
    return res.status(400).json({ error: err.message });
  }
});


// Get all quick bookings
router.get("/", async (req, res) => {
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const quickBookings = await QuickBooking.find({ salon_id })
      .populate("customer_id")
      .populate("branch_id")
      .populate("service_id")
      .populate("staff_id");
    res.status(200).json(quickBookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get a single quick booking by ID
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const quickBooking = await QuickBooking.findOne({ _id: id, salon_id })
      .populate("customer_id")
      .populate("branch_id")
      .populate("service_id")
      .populate("staff_id");
    if (!quickBooking) return res.status(404).json({ error: "Quick booking not found" });
    res.status(200).json(quickBooking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a quick booking by ID
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { salon_id, ...updateData } = req.body;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    // Ensure staff_id is an array of ObjectIds as per schema
    if (updateData.staff_id) {
      if (!Array.isArray(updateData.staff_id)) {
        updateData.staff_id = [updateData.staff_id];
      }
      updateData.staff_id = updateData.staff_id.map(id => new mongoose.Types.ObjectId(id));
    }
    // Ensure date and time fields are present
    if (updateData.date && updateData.time) {
      // ok
    } else if (updateData.date || updateData.time) {
      return res.status(400).json({ message: "Both date and time are required if updating either" });
    }
    const updatedQuickBooking = await QuickBooking.findOneAndUpdate({ _id: id, salon_id }, updateData, { new: true })
      .populate("customer_id")
      .populate("branch_id")
      .populate("service_id")
      .populate("staff_id");
    if (!updatedQuickBooking) return res.status(404).json({ error: "Quick booking not found" });
    res.status(200).json(updatedQuickBooking);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete a quick booking by ID
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const { salon_id } = req.query;

  if (!salon_id) {
    return res.status(400).json({ message: "salon_id is required" });
  }

  try {
    const deletedQuickBooking = await QuickBooking.findOneAndDelete({ _id: id, salon_id });
    if (!deletedQuickBooking) return res.status(404).json({ error: "Quick booking not found" });
    res.status(200).json({ message: "Quick booking deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
