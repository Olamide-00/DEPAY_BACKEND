import axios from "axios";
import dotenv from "dotenv";
import { generateRequestId } from "../../utils/generateID.js";
import History from "../../models/history.js";
import { getBalance } from "../../utils/getBalance.js";
import User from "../../models/users.js";
import { updateRevenue } from "../../utils/revenue.js";
import { sendPushNotification } from "../../controller/version2/pushNotification/pushNotification.js";
import { awardJTokens } from "../../utils/version2/jTokens.js";
dotenv.config();

const {
  VTPASS_API_KEY,
  VTPASS_PUBLIC_KEY,
  VTPASS_SECRET_KEY,
  VTPASS_BASE_URL,
  VTPASS_EMAIL,
  VTPASS_PASSWORD,
} = process.env;

export const getServices = async (identifier) => {
  try {
    const url = `${VTPASS_BASE_URL}/services?identifier=${identifier}`;
    const headers = {
      "api-key": VTPASS_API_KEY,
      "public-key": VTPASS_PUBLIC_KEY,
    };

    const response = await axios.get(url, { headers });
    return response.data;
  } catch (error) {
    console.error(
      "Error in getServices:",
      error.response ? error.response.data : error.message,
    );
    throw new Error(error.response ? error.response.data : error.message);
  }
};

export const getPackage = async (serviceID) => {
  try {
    const url = `${VTPASS_BASE_URL}/service-variations?serviceID=${serviceID}`;
    const headers = {
      "api-key": VTPASS_API_KEY,
      "public-key": VTPASS_PUBLIC_KEY,
    };

    const response = await axios.get(url, { headers });
    return response.data;
  } catch (error) {
    console.error(
      "Error in getServiceVariations:",
      error.response ? error.response.data : error.message,
    );
    throw new Error(error.response ? error.response.data : error.message);
  }
};

// pay bill service

export const payBill = async (payload) => {
  const percentRev = payload.percentRev || 0;
  const totalDeduction = Math.round(payload.amount + (payload.percentRev || 0));

  const balance = await getBalance(payload.email);
  if (balance === 0 || balance < totalDeduction) {
    throw new Error("Insufficient balance");
  }

  const updateBalance = async (email, amount) => {
    return await User.findOneAndUpdate(
      { email },
      { $inc: { balance: amount } },
      { new: true },
    );
  };

  await updateBalance(payload.email, -totalDeduction);

  try {
    payload.request_id = generateRequestId();
    const url = `${VTPASS_BASE_URL}/pay`;

    const credentials = `${VTPASS_EMAIL}:${VTPASS_PASSWORD}`;
    const encodedCredentials = Buffer.from(credentials).toString("base64");

    const headers = {
      Authorization: `Basic ${encodedCredentials}`,
      "api-key": VTPASS_API_KEY,
      "secret-key": VTPASS_SECRET_KEY,
      "Content-Type": "application/json",
    };

    const response = await axios.post(url, payload, { headers });

    const transactionReference =
      response.data.paymentReference || generateRequestId();

    const user = await User.findOne({ email: payload.email });

    if (
      response.status === 200 &&
      response.data?.content?.transactions?.status === "delivered"
    ) {
      const extractJambPin = (pinString) => {
        if (!pinString) return null;
        const match = pinString.match(/Pin\s*:\s*(\d+)/i);
        return match ? match[1] : null;
      };

      const history = new History({
        userId: user._id,
        service: response.data.content.transactions.type || payload.serviceID,
        amount: payload.amount,
        transactionReference,
        status: "SUCCESS",
        transactionNumber: payload.number,
        token: response.data.token
          ? response.data.token.replace("Token : ", "")
          : null,
        units: response.data.units || null,
        serialNumber: response.data.cards?.[0]?.Serial || null,
        pin: response.data.cards?.[0]?.Pin || null,
        jambPin: extractJambPin(
          response.data.purchased_code || response.data.Pin,
        ),
        serviceID: payload.serviceID,
        variation_code: payload.variation_code,
        billersCode: payload.billersCode,
        additionalData: response.data,
      });

      await history.save();

      // ── Award JTokens only on confirmed delivered transaction ──
      // payload.amount is already a number from the bill payload
      awardJTokens(payload.email, payload.amount).catch((err) =>
        console.error("[payBill] JToken award error:", err),
      );

      try {
        if (payload.pushToken) {
          await sendPushNotification(
            payload.pushToken,
            "Transaction Successful",
            `Payment of ${payload.amount}`,
          );
        }
      } catch (notificationError) {
        console.error("Error sending push notification:", notificationError);
      }
    } else {
      // Refund on failed transaction — no JTokens awarded
      await updateBalance(payload.email, totalDeduction);

      const history = new History({
        userId: user._id,
        service: payload.serviceID,
        amount: payload.amount,
        transactionReference,
        status: "FAILED",
        additionalData: response.data,
        transactionNumber: payload.number,
      });
      await history.save();
      console.error("Not successful", response.data);
    }

    if (payload.percentRev) {
      await updateRevenue("BILL", payload.percentRev);
    }
    return response.data;
  } catch (error) {
    await updateBalance(payload.email, totalDeduction);
    console.error(
      "Error in payBill:",
      error.response ? error.response.data : error.message,
    );
    throw new Error(
      error.response ? JSON.stringify(error.response.data) : error.message,
    );
  }
};
