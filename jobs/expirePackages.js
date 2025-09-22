const cron = require("node-cron");
const Customer = require("../models/Customer");

// Runs every day at midnight (00:00)
cron.schedule("0 0 * * *", async () => {
    try {
        const now = new Date();

        // ✅ Find all customers with active packages/memberships
        const customers = await Customer.find({
            $or: [
                { "branch_packages.status": "active" },
                { "branch_memberships.status": "active" }
            ]
        });

        for (const customer of customers) {
            let updated = false;

            // 🔹 Check packages
            customer.branch_packages.forEach(pkg => {
                if (pkg.status === "active" && pkg.valid_till && pkg.valid_till < now) {
                    pkg.status = "expired";
                    updated = true;
                }
            });

            // 🔹 Check memberships
            customer.branch_memberships.forEach(mem => {
                if (mem.status === "active" && mem.valid_till && mem.valid_till < now) {
                    mem.status = "expired";
                    updated = true;
                }
            });

            if (updated) {
                await customer.save();
                console.log(`✅ Updated expired items for customer ${customer._id}`);
            }
        }

        console.log("Cron job finished: expired packages/memberships updated.");
    } catch (err) {
        console.error("❌ Error in cron job:", err.message);
    }
});