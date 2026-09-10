import axios, { type AxiosResponse } from "axios";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { generateRequestId } from "../../utils/generateID.js";
import History from "../../models/history.js";
import User, { type UserDocument } from "../../models/users.js";
import { updateRevenue } from "../../utils/revenue.js";
import { awardJTokens } from "../../utils/version2/jTokens.js";
import { queueService } from "../version2/queueService.js";
import {
  debitWallet,
  creditWallet,
  InsufficientBalanceError,
} from "../ledger/ledgerService.js";
import { calculateFee } from "./feeService.js";
import type {
  PayBillPayload,
  VTPassPayResponseData,
} from "../../types/vtpass.js";

dotenv.config();

const {
  VTPASS_API_KEY,
  VTPASS_PUBLIC_KEY,
  VTPASS_SECRET_KEY,
  VTPASS_BASE_URL,
  VTPASS_EMAIL,
  VTPASS_PASSWORD,
} = process.env;

export const getServices = async (identifier: string): Promise<unknown> => {
  try {
    const url = `${VTPASS_BASE_URL}/services?identifier=${identifier}`;
    const headers = {
      "api-key": VTPASS_API_KEY,
      "public-key": VTPASS_PUBLIC_KEY,
    };

    const response = await axios.get(url, { headers });
    return response.data;
  } catch (error) {
    const axiosError = error as {
      response?: { data: unknown };
      message: string;
    };
    console.error(
      "Error in getServices:",
      axiosError.response ? axiosError.response.data : axiosError.message,
    );
    throw new Error(
      axiosError.response
        ? JSON.stringify(axiosError.response.data)
        : axiosError.message,
    );
  }
};

export const getPackage = async (serviceID: string): Promise<unknown> => {
  try {
    const url = `${VTPASS_BASE_URL}/service-variations?serviceID=${serviceID}`;
    const headers = {
      "api-key": VTPASS_API_KEY,
      "public-key": VTPASS_PUBLIC_KEY,
    };

    const response = await axios.get(url, { headers });
    return response.data;
  } catch (error) {
    const axiosError = error as {
      response?: { data: unknown };
      message: string;
    };
    console.error(
      "Error in getServiceVariations:",
      axiosError.response ? axiosError.response.data : axiosError.message,
    );
    throw new Error(
      axiosError.response
        ? JSON.stringify(axiosError.response.data)
        : axiosError.message,
    );
  }
};

interface RefundAndRecordFailureParams {
  user: Pick<UserDocument, "_id" | "balance">;
  payload: PayBillPayload;
  totalDeduction: number;
  fee: number;
  debitReference: string;
  historyId: mongoose.Types.ObjectId;
  transactionReference: string;
  responseData: unknown;
}

async function refundAndRecordFailure({
  user,
  payload,
  totalDeduction,
  fee,
  debitReference,
  historyId,
  transactionReference,
  responseData,
}: RefundAndRecordFailureParams): Promise<void> {
  try {
    await creditWallet({
      userId: user._id,
      amount: totalDeduction,
      category: "BILL_REFUND",
      reference: `RVSL-${debitReference}`,
      description: `Refund for failed ${payload.serviceID || "bill"} payment`,
      performedBy: "SYSTEM",
      relatedModel: "History",
      relatedId: historyId,
    });
  } catch (refundError) {
    console.error(
      `[payBill] CRITICAL: refund failed for ${payload.email}, debitReference=${debitReference}:`,
      refundError instanceof Error ? refundError.message : refundError,
    );
  }

  await History.create({
    _id: historyId,
    userId: user._id,
    service: payload.serviceID,
    amount: payload.amount,
    fee,
    transactionReference,
    status: "FAILED",
    // Money WAS debited from the wallet for this attempt (then
    // refunded via creditWallet above) — type reflects that the
    // original movement was a debit, distinct from `status` which
    // reflects the outcome. This is what admin/controller/
    // transactions.ts's reversal tool checks (`tx.type !== "DEBIT"`)
    // before allowing a manual wallet credit — without this, every
    // reversal attempt on a failed transaction was being rejected.
    type: "DEBIT",
    additionalData: responseData,
    transactionNumber: payload.number,
    serviceID: payload.serviceID,
  });
}

export const payBill = async (
  payload: PayBillPayload,
): Promise<VTPassPayResponseData> => {
  if (!payload.email) {
    throw new Error("email is required");
  }
  if (!payload.amount || payload.amount <= 0) {
    throw new Error("Invalid amount");
  }

  const { fee } = await calculateFee(payload.serviceID, payload.amount);
  const totalDeduction = Math.round((payload.amount + fee) * 100) / 100;

  if (totalDeduction <= 0) {
    throw new Error("Invalid amount");
  }

  const user = await User.findOne({ email: payload.email }).select(
    "_id balance",
  );
  if (!user) {
    throw new Error("User not found");
  }

  payload.request_id = generateRequestId();
  const debitReference = `BILL-${payload.request_id}`;
  const historyId = new mongoose.Types.ObjectId();

  try {
    await debitWallet({
      userId: user._id,
      amount: totalDeduction,
      category: "BILL_PAYMENT",
      reference: debitReference,
      description: `${payload.serviceID || "Bill"} payment`,
      performedBy: "USER",
      relatedModel: "History",
      relatedId: historyId,
      metadata: {
        serviceID: payload.serviceID,
        billersCode: payload.billersCode,
        variation_code: payload.variation_code,
        fee,
      },
    });
  } catch (error) {
    if (error instanceof InsufficientBalanceError) {
      throw new Error("Insufficient balance");
    }
    throw error;
  }

  let response: AxiosResponse<VTPassPayResponseData>;
  try {
    const url = `${VTPASS_BASE_URL}/pay`;

    const credentials = `${VTPASS_EMAIL}:${VTPASS_PASSWORD}`;
    const encodedCredentials = Buffer.from(credentials).toString("base64");

    const headers = {
      Authorization: `Basic ${encodedCredentials}`,
      "api-key": VTPASS_API_KEY,
      "secret-key": VTPASS_SECRET_KEY,
      "Content-Type": "application/json",
    };

    response = await axios.post<VTPassPayResponseData>(url, payload, {
      headers,
    });
  } catch (error) {
    const axiosError = error as {
      response?: { data: unknown };
      message: string;
    };
    const transactionReference = payload.request_id;
    await refundAndRecordFailure({
      user,
      payload,
      totalDeduction,
      fee,
      debitReference,
      historyId,
      transactionReference,
      responseData: axiosError.response
        ? axiosError.response.data
        : { message: axiosError.message },
    });

    console.error(
      "Error in payBill:",
      axiosError.response ? axiosError.response.data : axiosError.message,
    );
    throw new Error(
      axiosError.response
        ? JSON.stringify(axiosError.response.data)
        : axiosError.message,
    );
  }

  const transactionReference =
    response.data.paymentReference || payload.request_id;
  const delivered =
    response.status === 200 &&
    response.data?.content?.transactions?.status === "delivered";

  if (delivered) {
    const extractJambPin = (pinString?: string): string | null => {
      if (!pinString) return null;
      const match = pinString.match(/Pin\s*:\s*(\d+)/i);
      return match ? match[1] : null;
    };

    const txInfo = response.data.content?.transactions;
    const costPrice = Number(txInfo?.total_amount ?? payload.amount);
    const vtpassCommission = Number(txInfo?.commission ?? 0);
    const profit = Math.round((totalDeduction - costPrice) * 100) / 100;

    await History.create({
      _id: historyId,
      userId: user._id,
      service: txInfo?.type || payload.serviceID,
      amount: payload.amount,
      fee,
      costPrice,
      vtpassCommission,
      profit,
      transactionReference,
      status: "SUCCESS",
      // Never set before this fix — admin/controller/dashboard.ts's
      // totalSales/salesInPeriod, getSalesBreakdown, and
      // userManagement.ts's per-user totalSales all filter on
      // `type: "DEBIT"`. With this field absent, none of those
      // queries ever matched a real bill payment; they silently
      // returned 0 / empty regardless of actual transaction volume.
      type: "DEBIT",
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

    awardJTokens(payload.email, payload.amount).catch((err) =>
      console.error("[payBill] JToken award error:", err),
    );

    if (profit) {
      updateRevenue("BILL", profit).catch((err) =>
        console.error("[payBill] Revenue update error:", err),
      );
    }

    try {
      if (payload.pushToken) {
        await queueService.queuePushNotification(
          payload.pushToken,
          "Transaction Successful",
          `Payment of ${payload.amount}`,
        );
      }
    } catch (notificationError) {
      console.error("Error queueing push notification:", notificationError);
    }
  } else {
    await refundAndRecordFailure({
      user,
      payload,
      totalDeduction,
      fee,
      debitReference,
      historyId,
      transactionReference,
      responseData: response.data,
    });
    console.error("Not successful", response.data);
  }

  return response.data;
};
