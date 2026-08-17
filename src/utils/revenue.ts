import Revenue, { type RevenueType } from "../models/revenue.js";

async function updateRevenue(type: RevenueType, amount: number): Promise<void> {
  try {
    await Revenue.findOneAndUpdate(
      { type },
      { $inc: { amount } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    console.error(`Error updating revenue for type ${type}:`, error);
  }
}

export { updateRevenue };
