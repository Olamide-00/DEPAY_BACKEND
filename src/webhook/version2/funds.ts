import crypto from "crypto";
import dotenv from "dotenv";
import type { Request, Response } from "express";
import User from "../../models/users.js";
import Funding from "../../models/funding.js";
import { queueService } from "../../service/version2/queueService.js";
import { creditWallet } from "../../service/ledger/ledgerService.js";

dotenv.config();

// ══════════════════════════════════════════════════════════════════
// Paystack "charge.success" webhook (dedicated NUBAN funding)
//
// Webhooks WILL be redelivered by Paystack — on any non-2xx response,
// a timeout, or just as a retry policy. The old version of this
// handler had no protection against that: a redelivered event would
// credit the wallet a second time for the same deposit. It's now
// keyed off Paystack's own transaction reference (`event.data.reference`,
// guaranteed unique per charge) as the ledger idempotency key, so a
// duplicate delivery is a guaranteed no-op rather than a double
// credit.
//
// Signature verification is done against `req.rawBody` (captured in
// app.ts's express.json `verify` hook) rather than
// `JSON.stringify(req.body)`. Paystack signs the exact bytes it sent;
// re-serializing the parsed object is not guaranteed to reproduce
// those bytes (key order / number formatting can differ), which
// silently breaks the signature check and makes every webhook 401.
// ══════════════════════════════════════════════════════════════════

// Paystack's webhook payload is large and only partially documented
// here — just the fields this handler actually reads (checked against
// every access site below), left loose everywhere else rather than
// modeling the full payload precisely.
interface PaystackChargeEvent {
  event: string;
  data: {
    channel?: string;
    amount: number;
    reference?: string;
    id?: number | string;
    customer: { email: string };
    authorization?: { card_type?: string; sender_name?: string };
  };
}

export const handleWebhook = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  const secret = process.env.SECRET_KEY;

  if (!secret) {
    console.error(
      " PAYSTACK_SECRET_KEY is not defined in environment variables.",
    );
    return res.status(500).send("Server configuration error.");
  }

  if (!req.rawBody) {
    console.error(
      "[funding webhook] Missing rawBody — express.json's verify hook did not run for this request.",
    );
    return res.status(400).send("Bad request.");
  }

  // Verify signature against the exact bytes Paystack sent, not a
  // re-serialization of the parsed body.
  const hash = crypto
    .createHmac("sha512", secret)
    .update(req.rawBody)
    .digest("hex");

  if (hash !== req.headers["x-paystack-signature"]) {
    return res.status(401).send("Unauthorized");
  }

  const event = req.body as PaystackChargeEvent;

  if (
    event.event === "charge.success" &&
    event.data.channel === "dedicated_nuban"
  ) {
    const { email } = event.data.customer;
    const amount = event.data.amount / 100;
    const card_type = event.data.authorization?.card_type || "N/A";
    const sender_name = event.data.authorization?.sender_name || "N/A";
    const paystackReference = event.data.reference || event.data.id?.toString();

    if (!paystackReference) {
      console.error(
        "[funding webhook] Missing Paystack reference — cannot safely process without an idempotency key.",
      );
      return res.status(400).send("Missing transaction reference.");
    }

    try {
      const user = await User.findOne({ email });

      if (!user) {
        console.log(`User with email ${email} not found.`);
        return res.sendStatus(200);
      }

      const fundingReference = `FUND-${paystackReference}`;
      const { balance: newBalance, duplicate } = await creditWallet({
        userId: user._id,
        amount,
        category: "WALLET_FUNDING",
        reference: fundingReference,
        description: `Wallet funding via ${card_type}`,
        performedBy: "SYSTEM",
        relatedModel: "Funding",
        metadata: { card_type, sender_name, paystackReference },
      });

      if (duplicate) {
        console.log(
          `[funding webhook] Duplicate delivery for ${paystackReference} — already processed, ignoring.`,
        );
        return res.sendStatus(200);
      }

      // Save funding record (best-effort — the ledger entry above is
      // the source of truth; this mirrors it for the existing
      // Funding-collection based admin views).
      try {
        await Funding.create({
          userId: user._id,
          amount,
          card_type,
          sender_name,
          date: new Date(),
          reference: fundingReference,
        });
      } catch (fundingRecordError) {
        const code = (fundingRecordError as { code?: number })?.code;
        if (code !== 11000) {
          console.error(
            "[funding webhook] Failed to write Funding record:",
            fundingRecordError instanceof Error
              ? fundingRecordError.message
              : fundingRecordError,
          );
        }
      }

      console.log(
        `User ${email} balance updated by ₦${amount}. New balance: ₦${newBalance}`,
      );

      // Referral bonus — first successful funding only, credited to
      // the referrer. Also routed through the ledger now, keyed off
      // the same Paystack reference so it can't double-fire either.

      //referral bonus is disabled for now, will be re-enabled later///////////////////

      // if (user.referredBy && !user.redeemed) {
      //   const referrer = await User.findOne({ tag: user.referredBy });
      //   if (referrer) {
      //     const bonus = 500;
      //     try {
      //       await creditWallet({
      //         userId: referrer._id,
      //         amount: bonus,
      //         category: "REFERRAL_BONUS",
      //         reference: `REFBONUS-${paystackReference}`,
      //         description: `Referral bonus for referring ${email}`,
      //         performedBy: "SYSTEM",
      //         metadata: { referredUserId: user._id.toString(), referredEmail: email },
      //       });
      //       await User.updateOne({ _id: user._id }, { $set: { redeemed: true } });
      //     } catch (bonusError) {
      //       console.error(
      //         "[funding webhook] Referral bonus credit failed:",
      //         bonusError instanceof Error ? bonusError.message : bonusError,
      //       );
      //     }
      //   }
      // }

      // Push notification — queued (retried with backoff) rather
      // than a single fire-and-forget attempt.
      try {
        if (user.pushToken) {
          await queueService.queuePushNotification(
            user.pushToken,
            "Deposit Successful 💰",
            `₦${amount} has been added to your wallet`,
          );
        }
      } catch (notificationError) {
        console.error("Error queueing push notification:", notificationError);
      }

      // Emit update via Socket.IO
      const io = (
        req.app.locals as {
          io?: {
            to: (room: string) => {
              emit: (event: string, payload: unknown) => void;
            };
          };
        }
      ).io;
      if (io) {
        io.to(email).emit("balance_updated", {
          newBalance,
          amountAdded: amount,
        });
      }
    } catch (error) {
      console.error(" Error updating user balance:", error);
      return res.status(500).send("Internal Server Error");
    }
  }

  return res.sendStatus(200);
};
