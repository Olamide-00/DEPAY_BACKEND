import crypto from "crypto";
import dotenv from "dotenv";
import User from "../../models/users.js";
import Funding from "../../models/funding.js";
import { sendPushNotification } from "../../controller/version2/pushNotification/pushNotification.js";

dotenv.config();

export const handleWebhook = async (req, res) => {
  const secret = process.env.SECRET_KEY;

  if (!secret) {
    console.error(
      " PAYSTACK_SECRET_KEY is not defined in environment variables.",
    );
    return res.status(500).send("Server configuration error.");
  }

  // Verify signature
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

      if (!user) {
        console.log(`User with email ${email} not found.`);
        return res.sendStatus(200);
      }

      // Update user balance
      const oldBalance = user.balance;
      const newBalance = oldBalance + amount;
      user.balance = newBalance;

      //push notification
      try {
        if (user.pushToken) {
          await sendPushNotification(
            user.pushToken,
            "Deposit Successful 💰",
            `₦${amount} has been added to your wallet`,
          );
        }
      } catch (notificationError) {
        console.error("Error sending push notification:", notificationError);
      }

      // Save user with updated balance
      await user.save();

      // Save funding record
      await Funding.create({
        userId: user._id,
        amount,
        card_type,
        sender_name,
        date: new Date(),
      });

      console.log(
        `User ${email} balance updated by ₦${amount}. New balance: ₦${newBalance}`,
      );

      // Emit update via Socket.IO
      const io = req.app.locals.io;
      if (io) {
        io.to(email).emit("balance_updated", {
          newBalance: user.balance,
          amountAdded: amount,
        });
      }
    } catch (error) {
      console.error(" Error updating user balance:", error);
      return res.status(500).send("Internal Server Error");
    }
  }

  res.sendStatus(200);
};
