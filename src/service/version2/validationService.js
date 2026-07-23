import mongoose from 'mongoose';
import { CONFIG } from '../../utils/version2/constants.js';
import { sanitizeInput } from '../../utils/version2/helpers.js';
import { ValidationError } from '../../utils/version2/errors.js';

export const validateTransferRequest = (data) => {
  const { account_number, bank_code, amount, email, name } = data;
  const errors = [];

  // Sanitize inputs first
  const sanitizedAccount = sanitizeInput(account_number);
  const sanitizedBankCode = sanitizeInput(bank_code);
  const sanitizedAmount = sanitizeInput(amount);
  const sanitizedEmail = sanitizeInput(email);
  const sanitizedName = sanitizeInput(name);

  // Check for required fields
  if (!sanitizedAccount) errors.push('Account number is required');
  if (!sanitizedBankCode) errors.push('Bank code is required');
  if (!sanitizedAmount) errors.push('Amount is required');
  if (!sanitizedEmail) errors.push('Email is required');
  if (!sanitizedName) errors.push('Recipient name is required');

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  // Validate formats
  if (!/^\d{10}$/.test(sanitizedAccount.toString().trim())) {
    errors.push('Account number must be 10 digits');
  }

  if (!/^\d{3,6}$/.test(sanitizedBankCode.toString().trim())) {
    errors.push('Invalid bank code format');
  }

  const numAmount = parseFloat(sanitizedAmount);
  if (isNaN(numAmount) || numAmount < CONFIG.MIN_AMOUNT || numAmount > CONFIG.MAX_AMOUNT) {
    errors.push(`Amount must be between ₦${CONFIG.MIN_AMOUNT} and ₦${CONFIG.MAX_AMOUNT}`);
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedEmail)) {
    errors.push('Invalid email format');
  }

  if (sanitizedName.toString().trim().length < 2) {
    errors.push('Recipient name must be at least 2 characters long');
  }

  return { 
    isValid: errors.length === 0, 
    errors,
    sanitizedData: {
      account_number: sanitizedAccount,
      bank_code: sanitizedBankCode,
      amount: sanitizedAmount,
      email: sanitizedEmail,
      name: sanitizedName
    }
  };
};


//internal service
export const validateInternalTransferRequest = (data) => {
  const { email, tag, amount } = data;
  const errors = [];

  // Sanitize inputs
  const sanitizedEmail = sanitizeInput(email);
  const sanitizedTag = sanitizeInput(tag);
  const sanitizedAmount = sanitizeInput(amount);

  // Check for required fields
  if (!sanitizedEmail) errors.push('Sender email is required');
  if (!sanitizedTag) errors.push('Receiver tag is required');
  if (!sanitizedAmount) errors.push('Amount is required');

  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  // Validate formats
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitizedEmail)) {
    errors.push('Invalid sender email format');
  }

  if (sanitizedTag.toString().trim().length < 2) {
    errors.push('Receiver tag must be at least 2 characters long');
  }

  const numAmount = parseFloat(sanitizedAmount);
  if (isNaN(numAmount) || numAmount <= 0) {
    errors.push('Amount must be a positive number');
  }

  if (numAmount > 5000000) { // You can adjust this limit
    errors.push('Amount exceeds maximum transfer limit');
  }

  return { 
    isValid: errors.length === 0, 
    errors,
    sanitizedData: {
      email: sanitizedEmail,
      tag: sanitizedTag,
      amount: sanitizedAmount
    }
  };
};