import Revenue from "../models/revenue.js";

async function updateRevenue(type, amount) {
  try {
    await Revenue.findOneAndUpdate(
      { type },
      { $inc: { amount } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (error) {
    console.error(`Error updating revenue for type ${type}:`, error);
  }
}

export { updateRevenue };
