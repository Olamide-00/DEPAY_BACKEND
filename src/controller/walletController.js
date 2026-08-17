import {
  createReservedAccount,
  getAllAccounts,
  verifyBankService,
} from "../service/walletService.js";
import User from "../models/users.js";
import dotenv from "dotenv";

dotenv.config();

// create account controller
export const createReservedAccountController = async (req, res) => {
  try {
    const accountData = req.body;

    // Validate required fields
    if (!accountData.phone) {
      return res.status(400).json({ message: "Customer phone is required" });
    }

    // Set default preferred bank
    accountData.preferred_bank = "wema-bank";
    accountData.country = "NG";

    const response = await createReservedAccount(accountData);

    // update user wallet creation status
    const updateUser = await User.findOneAndUpdate(
      { email: accountData.email },
      { isWalletCreated: true },
      { new: true }
    );

    return res.status(201).json({
      message: "Reserved account created successfully",
      data: response.data,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to create reserved account",
      error: error.message,
    });
  }
};






// account created controller
export const getAllAccountsController = async (req, res) => {
  try {
    const accounts = await getAllAccounts();

    const simplifiedAccounts = accounts.data.map((account) => ({
      id: account.id,
      email: account.customer.email,
      account_number: account.account_number,
    }));

    return res.status(200).json({
      message: "Reserved accounts fetched successfully",
      data: simplifiedAccounts,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch reserved accounts",
      error: error.message,
    });
  }
};

// account number details
export const getAccountByEmailController = async (req, res) => {
  try {
    const { email } = req.params;

    // Fetch all accounts
    const accounts = await getAllAccounts();

    // Find the account with the matching email
    const account = accounts.data.find((acc) => acc.customer.email === email);

    if (!account) {
      return res.status(404).json({
        message: "Account with the given email not found",
      });
    }

    // Return the account with only necessary fields
    const simplifiedAccount = {
      id: account.id,
      email: account.customer.email,
      account_number: account.account_number,
      bank_name: account.bank.name,
    };

    return res.status(200).json({
      message: "Account fetched successfully",
      data: simplifiedAccount,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch account",
      error: error.message,
    });
  }
};

// verify bank details
export const verifyBankAccount = async (req, res) => {
  try {
    const { bankCode, accountNumber } = req.query;
    if (!bankCode || !accountNumber) {
      return res
        .status(400)
        .json({ message: "bankCode and accountNumber are required" });
    }

    const data = await verifyBankService(bankCode, accountNumber);
    return res.status(200).json(data);
  } catch (error) {
    console.error("Error verifying bank account:", error.message);
    return res
      .status(500)
      .json({ message: "Error verifying bank account", error: error.message });
  }
};
