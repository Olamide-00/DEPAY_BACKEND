import axios from "axios";
import { retryWithBackoff } from "../../../utils/version2/wallet/retry.js";

const URL = process.env.URL;
const SECRET_KEY = process.env.SECRET_KEY;

// Create axios instance with timeout
const axiosInstance = axios.create({
  timeout: 30000,
  maxRedirects: 5,
});

export interface ReservedAccountInput {
  email: string;
  phone?: string;
  [key: string]: unknown;
}

interface CustomError extends Error {
  statusCode?: number;
  originalError?: unknown;
}

export const createReservedAccount = async (
  accountData: ReservedAccountInput,
  retryOptions: Parameters<typeof retryWithBackoff>[1] = {},
): Promise<{ data: unknown }> => {
  const validateInput = () => {
    if (!accountData.email) {
      const error: CustomError = new Error("Customer email is required");
      error.statusCode = 400;
      throw error;
    }
  };

  validateInput();

  return retryWithBackoff(async () => {
    try {
      const response = await axiosInstance.post(
        `${URL}/dedicated_account/assign`,
        accountData,
        {
          headers: {
            Authorization: `Bearer ${SECRET_KEY}`,
            "Content-Type": "application/json",
          },
        },
      );

      // Log the response structure for debugging (remove in production)
      console.log("Raw Paystack Response:", {
        status: response.status,
        statusText: response.statusText,
        data: response.data,
      });

      return response.data;
    } catch (error) {
      const axiosError = error as {
        response?: { status?: number; data?: { message?: string } };
        message: string;
      };
      const statusCode = axiosError.response?.status || 500;
      const errorMessage =
        axiosError.response?.data?.message ||
        axiosError.message ||
        "Unable to create reserved account";

      const customError: CustomError = new Error(errorMessage);
      customError.statusCode = statusCode;
      customError.originalError = error;

      console.error("Error creating reserved account:", {
        statusCode,
        message: errorMessage,
        phone: accountData.phone,
        timestamp: new Date().toISOString(),
        responseData: axiosError.response?.data, // Log the error response data
      });

      throw customError;
    }
  }, retryOptions);
};
