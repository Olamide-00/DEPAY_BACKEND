import History from "../../../models/history.js";
import User from "../../../models/users.js";
import {
  getPackage,
  getServices,
  payBill,
} from "../../../service/bills/services.js";
import { awardJTokens } from "../../../utils/version2/jTokens.js";

// Constants
const CACHE_TTL = {
  SERVICES: 24 * 60 * 60 * 1000,
  VARIATIONS: 24 * 60 * 60 * 1000,
  HISTORY: 2 * 60 * 60 * 1000,
  TRANSACTIONS: 0,
};

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;
const CLEANUP_INTERVAL = 30 * 60 * 1000;
const HEALTH_CHECK_INTERVAL = 60 * 60 * 1000;

// Smart Cache Manager with auto-management
class AutoCacheManager {
  constructor() {
    this.cache = new Map();
    this.hitCount = new Map();
    this.missCount = new Map();
    this.sizeLimit = 1000;
    this.startAutoManagement();
  }

  set(key, data, ttl = CACHE_TTL.SERVICES) {
    if (this.cache.size >= this.sizeLimit) {
      this.evictLeastUsed();
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      accessCount: 0,
    });
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) {
      this.recordMiss(key);
      return null;
    }

    if (Date.now() - item.timestamp > item.ttl) {
      this.cache.delete(key);
      this.recordMiss(key);
      return null;
    }

    item.accessCount++;
    this.recordHit(key);
    return item.data;
  }

  recordHit(key) {
    this.hitCount.set(key, (this.hitCount.get(key) || 0) + 1);
  }

  recordMiss(key) {
    this.missCount.set(key, (this.missCount.get(key) || 0) + 1);
  }

  delete(key) {
    this.cache.delete(key);
    this.hitCount.delete(key);
    this.missCount.delete(key);
  }

  clear() {
    this.cache.clear();
    this.hitCount.clear();
    this.missCount.clear();
  }

  evictLeastUsed() {
    if (this.cache.size === 0) return;

    let leastUsedKey = null;
    let minAccessCount = Infinity;

    for (const [key, item] of this.cache.entries()) {
      if (item.accessCount < minAccessCount) {
        minAccessCount = item.accessCount;
        leastUsedKey = key;
      }
    }

    if (leastUsedKey) {
      console.log(`Auto-evicting least used cache key: ${leastUsedKey}`);
      this.delete(leastUsedKey);
    }
  }

  startAutoManagement() {
    setInterval(() => {
      this.cleanupExpired();
    }, CLEANUP_INTERVAL);

    setInterval(() => {
      this.healthCheck();
    }, HEALTH_CHECK_INTERVAL);

    setInterval(() => {
      this.optimizeCache();
    }, HEALTH_CHECK_INTERVAL * 2);
  }

  cleanupExpired() {
    const now = Date.now();
    let expiredCount = 0;

    for (const [key, item] of this.cache.entries()) {
      if (now - item.timestamp > item.ttl) {
        this.cache.delete(key);
        this.hitCount.delete(key);
        this.missCount.delete(key);
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      console.log(
        `Auto-cleanup: Removed ${expiredCount} expired cache entries`,
      );
    }
  }

  healthCheck() {
    const totalSize = this.cache.size;
    const hitRate = this.calculateHitRate();

    console.log(
      `Cache Health Check - Size: ${totalSize}, Hit Rate: ${(hitRate * 100).toFixed(2)}%`,
    );

    if (hitRate < 0.3 && totalSize > 500) {
      this.sizeLimit = Math.max(100, Math.floor(totalSize * 0.8));
      console.log(
        `Adjusting cache size limit to: ${this.sizeLimit} due to low hit rate`,
      );
    }
  }

  calculateHitRate() {
    let totalHits = 0;
    let totalMisses = 0;

    for (const count of this.hitCount.values()) totalHits += count;
    for (const count of this.missCount.values()) totalMisses += count;

    const total = totalHits + totalMisses;
    return total === 0 ? 0 : totalHits / total;
  }

  optimizeCache() {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    for (const [key, item] of this.cache.entries()) {
      if (item.timestamp < weekAgo && item.accessCount < 5) {
        console.log(`Optimizing cache: Removing old unused key ${key}`);
        this.delete(key);
      }
    }
  }

  async autoRefresh(key, fetchOperation, ttl) {
    const item = this.cache.get(key);
    if (!item) return;

    const timeUntilExpiry = item.ttl - (Date.now() - item.timestamp);
    const isPopular = item.accessCount > 10;
    const isNearingExpiry = timeUntilExpiry < item.ttl * 0.2;

    if (isPopular && isNearingExpiry) {
      try {
        console.log(`Auto-refreshing cache for key: ${key}`);
        const newData = await fetchOperation();
        this.set(key, newData, ttl);
      } catch (error) {
        console.warn(`Auto-refresh failed for ${key}:`, error.message);
      }
    }
  }

  getStats() {
    return {
      size: this.cache.size,
      hitRate: this.calculateHitRate(),
      hitCount: Array.from(this.hitCount.entries()).reduce(
        (sum, [_, count]) => sum + count,
        0,
      ),
      missCount: Array.from(this.missCount.entries()).reduce(
        (sum, [_, count]) => sum + count,
        0,
      ),
      sizeLimit: this.sizeLimit,
      timestamp: new Date().toISOString(),
    };
  }
}

// Initialize auto-managed cache instances
const serviceCache = new AutoCacheManager();
const packageCache = new AutoCacheManager();
const historyCache = new AutoCacheManager();

// Utility functions
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withRetry = async (
  operation,
  maxRetries = MAX_RETRIES,
  delayMs = RETRY_DELAY,
) => {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.warn(`Attempt ${attempt} failed:`, error.message);

      if (attempt < maxRetries) {
        const exponentialDelay = delayMs * Math.pow(2, attempt - 1);
        await delay(exponentialDelay);
      }
    }
  }

  throw lastError;
};

const validateEmail = (email) => {
  if (!email || typeof email !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim().toLowerCase());
};

const normalizeEmail = (email) => {
  if (!email || typeof email !== "string") return null;
  return email.trim().toLowerCase();
};

const generateCacheKey = (prefix, ...args) => {
  return `${prefix}:${args.filter((arg) => arg != null).join(":")}`;
};

const cacheWrapper = async (
  cacheManager,
  cacheKey,
  operation,
  ttl,
  enableAutoRefresh = false,
) => {
  const cachedData = cacheManager.get(cacheKey);
  if (cachedData) {
    console.log(`Cache hit for key: ${cacheKey}`);

    if (enableAutoRefresh) {
      cacheManager.autoRefresh(cacheKey, operation, ttl).catch(console.error);
    }

    return cachedData;
  }

  console.log(`Cache miss for key: ${cacheKey}, fetching fresh data...`);
  const data = await operation();

  cacheManager.set(cacheKey, data, ttl);
  return data;
};

export const getServicesController = async (req, res) => {
  const { identifier } = req.query;

  try {
    if (!identifier || typeof identifier !== "string") {
      return res.status(400).json({
        success: false,
        message: "Service identifier is required and must be a string",
      });
    }

    const cacheKey = generateCacheKey("services", identifier);

    const data = await cacheWrapper(
      serviceCache,
      cacheKey,
      () => withRetry(() => getServices(identifier)),
      CACHE_TTL.SERVICES,
      true,
    );

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in getServicesController:", error.message);

    const statusCode = error.message?.includes("not found") ? 404 : 500;

    return res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};

//pay bill controller

export const payBillController = async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({
        success: false,
        message: "Invalid payment payload",
      });
    }

    const data = await withRetry(() => payBill(payload));

    const userEmail = payload.email || payload.customer_email;
    if (userEmail) {
      const historyKey = generateCacheKey(
        "bills_history",
        normalizeEmail(userEmail),
      );
      historyCache.delete(historyKey);
      console.log(`Auto-invalidated cache for: ${historyKey}`);
    }

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in payBillController:", error.message);

    let statusCode = 500;
    let message = error.message;

    if (
      error.message?.includes("insufficient") ||
      error.message?.includes("balance")
    ) {
      statusCode = 402;
    } else if (
      error.message?.includes("invalid") ||
      error.message?.includes("validation")
    ) {
      statusCode = 400;
    } else if (
      error.message?.includes("timeout") ||
      error.message?.includes("network")
    ) {
      statusCode = 408;
    }

    return res.status(statusCode).json({
      success: false,
      message: message,
    });
  }
};

export const getServiceVariationsController = async (req, res) => {
  try {
    const serviceID = req.query.serviceID || "mtn-data";

    if (typeof serviceID !== "string") {
      return res.status(400).json({
        success: false,
        message: "Service ID must be a string",
      });
    }

    const cacheKey = generateCacheKey("variations", serviceID);

    const data = await cacheWrapper(
      packageCache,
      cacheKey,
      () => withRetry(() => getPackage(serviceID)),
      CACHE_TTL.VARIATIONS,
      true,
    );

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error in getServiceVariationsController:", error.message);

    const statusCode = error.message?.includes("not found") ? 404 : 500;

    return res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};

export const getBillsHistories = async (req, res) => {
  const { email } = req.params;

  if (!email) {
    return res.status(400).json({
      message: "Email is required",
    });
  }

  try {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !validateEmail(normalizedEmail)) {
      return res.status(400).json({
        message: "Invalid email format",
      });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const cacheKey = generateCacheKey("bills_history", normalizedEmail);

    const filteredHistories = await cacheWrapper(
      historyCache,
      cacheKey,
      async () => {
        const histories = await History.find({ userId: user._id }).sort({
          createdAt: -1,
        });

        return histories.map((history) => ({
          service: history.service,
          amount: history.amount,
          transactionReference: history.transactionReference,
          status: history.status,
          receipentName: history.receipentName,
          receipentBank: history.receipentBank,
          type: history.type,
          name: history.name,
          serviceID: history.serviceID,
          variation_code: history.variation_code,
          billersCode: history.billersCode,
          destinationBankName: history.destinationBankName,
          account_number: history.account_number,
          senderBank: history.senderBank,
          phone: history.additionalData?.content?.transactions?.phone || null,
          date: history.createdAt,
          unique_element:
            history.additionalData?.content?.transactions?.unique_element ||
            null,
          transaction_id:
            history.additionalData?.content?.transactions?.transactionId ||
            null,
          transaction_date: history.additionalData?.transaction_date || null,
          token: history.token || null,
          units: history.units || null,
          jambPin: history.jambPin || null,
          serialNumber: history.serialNumber || null,
          pin: history.pin || null,
        }));
      },
      CACHE_TTL.HISTORY,
      false,
    );

    return res.status(200).json(filteredHistories);
  } catch (error) {
    console.error("Error fetching bill history:", error.message);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// Export cache managers for monitoring
export { serviceCache, packageCache, historyCache };
