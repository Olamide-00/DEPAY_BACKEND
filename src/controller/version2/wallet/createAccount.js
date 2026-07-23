import User from "../../../models/users.js";
import { createReservedAccount } from "../../../service/version2/walletService/createReserveAccount.js";
import axios from "axios";

// Input validation schema
const validateCreateAccountRequest = (accountData) => {
  const errors = [];

  if (!accountData.phone) {
    errors.push("Customer phone is required");
  }
  if (!accountData.email) {
    errors.push("Customer email is required");
  }
  if (!accountData.first_name) {
    errors.push("First name is required");
  }
  if (!accountData.last_name) {
    errors.push("Last name is required");
  }

  return errors;
};

// Function to fetch dedicated account by customer email
const fetchDedicatedAccountByEmail = async (email) => {
  try {
    const URL = process.env.URL;
    const SECRET_KEY = process.env.SECRET_KEY;

    console.log(`Fetching dedicated account for email: ${email}`);

    // First, get the customer by email
    const customerResponse = await axios.get(`${URL}/customer`, {
      headers: {
        Authorization: `Bearer ${SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      params: {
        email: email,
      },
    });

    console.log(
      "Customer response:",
      JSON.stringify(customerResponse.data, null, 2),
    );

    const customers = customerResponse.data?.data || [];
    const customer = customers[0]; // Get the first customer with this email

    if (!customer || !customer.id) {
      console.log("Customer not found with email:", email);
      return null;
    }

    console.log("Found customer:", customer.id, customer.customer_code);

    // Now fetch dedicated accounts for this customer
    // Note: Paystack might have a different endpoint for this
    const dedicatedAccountResponse = await axios.get(
      `${URL}/dedicated_account`,
      {
        headers: {
          Authorization: `Bearer ${SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        params: {
          customer: customer.id,
        },
      },
    );

    console.log(
      "Dedicated account response:",
      JSON.stringify(dedicatedAccountResponse.data, null, 2),
    );

    const accounts = dedicatedAccountResponse.data?.data || [];

    // Find the most recently created dedicated account for this customer
    if (accounts.length > 0) {
      // Sort by created_at descending to get the latest
      const sortedAccounts = accounts.sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at),
      );

      return sortedAccounts[0];
    }

    return null;
  } catch (error) {
    console.error("Error fetching dedicated account:", {
      message: error.message,
      response: error.response?.data,
    });
    return null;
  }
};

// Function to fetch dedicated account with retries
const fetchDedicatedAccountWithRetry = async (
  email,
  maxRetries = 5,
  delay = 2000,
) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`Attempt ${attempt} to fetch dedicated account for ${email}`);

    const account = await fetchDedicatedAccountByEmail(email);

    if (account && account.account_number) {
      console.log(
        `Found dedicated account on attempt ${attempt}:`,
        account.account_number,
      );
      return account;
    }

    if (attempt < maxRetries) {
      console.log(`Waiting ${delay}ms before next attempt...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      // Increase delay for next attempt (exponential backoff)
      delay = Math.min(delay * 1.5, 10000);
    }
  }

  console.log(`Failed to find dedicated account after ${maxRetries} attempts`);
  return null;
};

export const createReservedAccountController = async (req, res) => {
  const startTime = Date.now();

  try {
    const accountData = req.body;

    // Validate input
    const validationErrors = validateCreateAccountRequest(accountData);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: validationErrors,
      });
    }

    // Set defaults
    const processedData = {
      ...accountData,
      preferred_bank: accountData.preferred_bank || "wema-bank",
      country: accountData.country || "NG",
    };

    // Check if user exists and wallet is already created
    const existingUser = await User.findOne({ email: accountData.email });

    if (existingUser?.isWalletCreated && existingUser?.accountNumber) {
      return res.status(400).json({
        success: false,
        message: "Wallet already created for this user",
        data: {
          accountNumber: existingUser.accountNumber,
          bankName: existingUser.bankName,
        },
      });
    }

    // Create reserved account with retry logic
    const response = await createReservedAccount(processedData);

    console.log("Paystack Response:", JSON.stringify(response, null, 2));

    // If we got account details immediately, use them
    if (response.data?.account_number) {
      // Account was created immediately
      const accountDetails = response.data;
      const bankInfo = accountDetails.bank || {};
      const bankName = bankInfo.name || "Unknown Bank";
      const accountNumber = accountDetails.account_number;
      const accountName = accountDetails.account_name;
      const accountId = accountDetails.id;

      // Update user with account details
      const updatedUser = await User.findOneAndUpdate(
        { email: accountData.email },
        {
          isWalletCreated: true,
          reservedAccountId: accountId,
          reservedAccountName: accountName || null,
          bankName: bankName,
          accountNumber: accountNumber,
          updatedAt: new Date(),
        },
        { new: true, runValidators: true },
      );

      const duration = Date.now() - startTime;

      return res.status(201).json({
        success: true,
        message: "Reserved account created successfully",
        data: {
          accountId: accountId,
          accountNumber: accountNumber,
          accountName: accountName,
          bankName: bankName,
        },
        meta: {
          duration: `${duration}ms`,
        },
      });
    }
    // Handle "in progress" response by trying to fetch the account
    else if (response.message?.includes("in progress")) {
      // Try to fetch the dedicated account (it might be ready immediately but API response is delayed)
      const dedicatedAccount = await fetchDedicatedAccountWithRetry(
        accountData.email,
        8,
        1500,
      );

      if (dedicatedAccount && dedicatedAccount.account_number) {
        // Successfully fetched the account
        const bankInfo = dedicatedAccount.bank || {};
        const bankName = bankInfo.name || "Unknown Bank";
        const accountNumber = dedicatedAccount.account_number;
        const accountName = dedicatedAccount.account_name;
        const accountId = dedicatedAccount.id;

        // Update user with account details
        const updatedUser = await User.findOneAndUpdate(
          { email: accountData.email },
          {
            isWalletCreated: true,
            reservedAccountId: accountId,
            reservedAccountName: accountName || null,
            bankName: bankName,
            accountNumber: accountNumber,
            updatedAt: new Date(),
          },
          { new: true, runValidators: true },
        );

        const duration = Date.now() - startTime;

        return res.status(201).json({
          success: true,
          message: "Reserved account created successfully",
          data: {
            accountId: accountId,
            accountNumber: accountNumber,
            accountName: accountName,
            bankName: bankName,
          },
          meta: {
            duration: `${duration}ms`,
          },
        });
      }

      // If we still couldn't get the account, mark as pending
      await User.findOneAndUpdate(
        { email: accountData.email },
        {
          isWalletCreated: true,
          updatedAt: new Date(),
        },
        { new: true, runValidators: true },
      );

      // Return 202 Accepted with instructions to check back
      return res.status(202).json({
        success: true,
        message:
          "Account creation initiated. The account is being set up and should be ready in a moment.",
        data: null,
        meta: {
          status: "pending",
          checkEndpoint: `/api/v1/wallet/account-status?email=${encodeURIComponent(accountData.email)}`,
        },
      });
    } else {
      throw new Error("Unexpected response from Paystack");
    }
  } catch (error) {
    const duration = Date.now() - startTime;

    console.error("Failed to create reserved account:", {
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      email: req.body?.email,
      phone: req.body?.phone,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
    });

    // Handle specific error types
    if (error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        message: error.message,
        meta: { duration: `${duration}ms` },
      });
    }

    if (error.statusCode === 429) {
      return res.status(429).json({
        success: false,
        message: "Rate limit exceeded. Please try again later",
        meta: { duration: `${duration}ms` },
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create reserved account",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "An error occurred",
      meta: { duration: `${duration}ms` },
    });
  }
};

// Updated status check endpoint
export const checkAccountStatusController = async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    // First check in our database
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // If we already have the account number in DB, return it
    if (user.accountNumber) {
      return res.status(200).json({
        success: true,
        message: "Account is ready",
        data: {
          accountNumber: user.accountNumber,
          bankName: user.bankName,
          accountName: user.reservedAccountName,
        },
        meta: {
          status: "completed",
        },
      });
    }

    // If not in DB, try to fetch from Paystack
    if (user.isWalletCreated) {
      const dedicatedAccount = await fetchDedicatedAccountByEmail(email);

      if (dedicatedAccount && dedicatedAccount.account_number) {
        // Update user with the fetched account details
        const bankInfo = dedicatedAccount.bank || {};
        const updatedUser = await User.findOneAndUpdate(
          { email },
          {
            reservedAccountId: dedicatedAccount.id,
            reservedAccountName: dedicatedAccount.account_name || null,
            bankName: bankInfo.name || "Unknown Bank",
            accountNumber: dedicatedAccount.account_number,
          },
          { new: true, runValidators: true },
        );

        return res.status(200).json({
          success: true,
          message: "Account is ready",
          data: {
            accountNumber: updatedUser.accountNumber,
            bankName: updatedUser.bankName,
            accountName: updatedUser.reservedAccountName,
          },
          meta: {
            status: "completed",
          },
        });
      }

      // Still pending
      return res.status(202).json({
        success: true,
        message: "Account creation still in progress",
        data: null,
        meta: {
          status: "pending",
        },
      });
    } else {
      // Not started
      return res.status(404).json({
        success: false,
        message: "No account creation in progress",
        meta: {
          status: "not_started",
        },
      });
    }
  } catch (error) {
    console.error("Error checking account status:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to check account status",
    });
  }
};
