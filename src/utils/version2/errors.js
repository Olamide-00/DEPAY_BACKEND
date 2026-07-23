export class AppError extends Error {
  constructor(message, code = 'INTERNAL_ERROR') {
    super(message);
    this.code = code;
    this.isOperational = true;
    this.timestamp = new Date().toISOString();
  }
}

export class ValidationError extends AppError {
  constructor(message, errors = []) {
    super(message, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

export class TransferError extends AppError {
  constructor(message) {
    super(message, 'TRANSFER_FAILED');
  }
}

export class InsufficientBalanceError extends AppError {
  constructor(message = 'Insufficient balance') {
    super(message, 'INSUFFICIENT_BALANCE');
  }
}