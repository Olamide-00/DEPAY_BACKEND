export const errorHandler = (err, req, res, next) => {
  console.error("Error:", err);

  // Default error
  let error = { 
    message: "Internal server error", 
    statusCode: 500 
  };

  // Mongoose validation error
  if (err.name === "ValidationError") {
    error.message = Object.values(err.errors).map(val => val.message).join(", ");
    error.statusCode = 400;
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    error.message = "Duplicate field value entered";
    error.statusCode = 400;
  }

  // Mongoose cast error (invalid ObjectId)
  if (err.name === "CastError") {
    error.message = "Resource not found";
    error.statusCode = 404;
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    error.message = "Invalid token";
    error.statusCode = 401;
  }

  if (err.name === "TokenExpiredError") {
    error.message = "Token expired";
    error.statusCode = 401;
  }

  // Custom error with statusCode
  if (err.statusCode) {
    error.statusCode = err.statusCode;
    error.message = err.message;
  }


  if (process.env.NODE_ENV === "development") {
    console.error(err.stack);
  }

  res.status(error.statusCode).json({
    error: error.message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack })
  });
};