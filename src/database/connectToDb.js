import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const dbURL = process.env.DATABASE_URL;

// Validate environment variable
if (!dbURL) {
  console.error("❌ DATABASE_URL is not defined in environment variables");
  process.exit(1);
}

export const connectToDb = async () => {
  try {
    const connectionOptions = {
      // Connection pool settings
      maxPoolSize: 10,
      minPoolSize: 2,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000,
      
      // Write concerns
      w: 'majority',
      retryWrites: true,
    };

    await mongoose.connect(dbURL, connectionOptions);
    console.log("✅ Connected to the database successfully");
    
    // Set global mongoose options
    mongoose.set('strictQuery', true);
    
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    process.exit(1);
  }
};