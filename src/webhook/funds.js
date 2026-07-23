import crypto from "crypto";
import dotenv from "dotenv";
import User from "../models/users.js";
import Funding from "../models/funding.js";

dotenv.config();

export const handleWebhook = async (req, res) => {
  const secret = process.env.SECRET_KEY;
  if (!secret) {
    console.error("PAYSTACK_SECRET_KEY is not defined.");
    return res.status(500).send("Server configuration error.");
  }

  const hash = crypto
    .createHmac("sha512", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (hash !== req.headers["x-paystack-signature"]) {
    return res.status(401).send("Unauthorized");
  }

  const event = req.body;

  if (
    event.event === "charge.success" &&
    event.data.channel === "dedicated_nuban"
  ) {
    const { email } = event.data.customer;
    const amount = event.data.amount / 100;
    const card_type = event.data.authorization?.card_type || "N/A";
    const sender_name = event.data.authorization?.sender_name || "N/A";

    try {
      const user = await User.findOne({ email });

      if (user) {
        // Update user balance
        user.balance += amount;
        await user.save();

        //referral bonus

        if(user.referredBy && !user.redeemed){
          const referrer = await User.findOne({ tag: user.referredBy });
          if(referrer){
            const bonus = 500; 
            referrer.balance += bonus;
            await referrer.save();
          }
        }


        // Save funding record
        await Funding.create({
          userId: user._id,
          amount,
          card_type,
          sender_name,
          date: new Date(),
        });

        console.log(`User ${email} balance updated by ₦${amount}.`);

        // Emit Socket.IO event to frontend using email as room
        const io = req.app.locals.io;
        io.to(email).emit("balance_updated", {
          newBalance: user.balance,
          amountAdded: amount,
        });
      } else {
        console.log(`User with email ${email} not found.`);
      }
    } catch (error) {
      console.error("Error updating user balance:", error);
      return res.status(500).send("Internal Server Error");
    }
  }

  // Respond to Paystack
  res.sendStatus(200);
};
