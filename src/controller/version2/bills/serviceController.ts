import type { Request, Response } from "express";
import History from "../../../models/history.js";
import User from "../../../models/users.js";
import {
  getPackage,
  getServices,
  payBill,
} from "../../../service/bills/services.js";
import type { PayBillPayload } from "../../../types/vtpass.js";
import { normalizeServiceLabel } from "../../../utils/serviceLabel.js";

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

interface CacheItem<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
}

// Smart Cache Manager with auto-management
class AutoCacheManager<T = unknown> {
  private cache = new Map<string, CacheItem<T>>();
  private hitCount = new Map<string, number>();
  private missCount = new Map<string, number>();
  private sizeLimit = 1000;

  constructor() {
    this.startAutoManagement();
  }

  set(key: string, data: T, ttl: number = CACHE_TTL.SERVICES): void {
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

  get(key: string): T | null {
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

  recordHit(key: string): void {
    this.hitCount.set(key, (this.hitCount.get(key) || 0) + 1);
  }

  recordMiss(key: string): void {
    this.missCount.set(key, (this.missCount.get(key) || 0) + 1);
  }

  delete(key: string): void {
    this.cache.delete(key);
    this.hitCount.delete(key);
    this.missCount.delete(key);
  }

  clear(): void {
    this.cache.clear();
    this.hitCount.clear();
    this.missCount.clear();
  }

  evictLeastUsed(): void {
    if (this.cache.size === 0) return;

    let leastUsedKey: string | null = null;
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

  startAutoManagement(): void {
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

  cleanupExpired(): void {
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

  healthCheck(): void {
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

  calculateHitRate(): number {
    let totalHits = 0;
    let totalMisses = 0;

    for (const count of this.hitCount.values()) totalHits += count;
    for (const count of this.missCount.values()) totalMisses += count;

    const total = totalHits + totalMisses;
    return total === 0 ? 0 : totalHits / total;
  }

  optimizeCache(): void {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    for (const [key, item] of this.cache.entries()) {
      if (item.timestamp < weekAgo && item.accessCount < 5) {
        console.log(`Optimizing cache: Removing old unused key ${key}`);
        this.delete(key);
      }
    }
  }

  async autoRefresh(
    key: string,
    fetchOperation: () => Promise<T>,
    ttl: number,
  ): Promise<void> {
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
        console.warn(
          `Auto-refresh failed for ${key}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  getStats() {
    return {
      size: this.cache.size,
      hitRate: this.calculateHitRate(),
      hitCount: Array.from(this.hitCount.entries()).reduce(
        (sum, [, count]) => sum + count,
        0,
      ),
      missCount: Array.from(this.missCount.entries()).reduce(
        (sum, [, count]) => sum + count,
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
const historyCache = new AutoCacheManager<unknown[]>();

// Utility functions
const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const withRetry = async <T>(
  operation: () => Promise<T>,
  maxRetries = MAX_RETRIES,
  delayMs = RETRY_DELAY,
): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.warn(
        `Attempt ${attempt} failed:`,
        error instanceof Error ? error.message : error,
      );

      if (attempt < maxRetries) {
        const exponentialDelay = delayMs * Math.pow(2, attempt - 1);
        await delay(exponentialDelay);
      }
    }
  }

  throw lastError;
};

const validateEmail = (email: unknown): email is string => {
  if (!email || typeof email !== "string") return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim().toLowerCase());
};

const normalizeEmail = (email: unknown): string | null => {
  if (!email || typeof email !== "string") return null;
  return email.trim().toLowerCase();
};

const generateCacheKey = (
  prefix: string,
  ...args: Array<string | null | undefined>
): string => {
  return `${prefix}:${args.filter((arg) => arg != null).join(":")}`;
};

const cacheWrapper = async <T>(
  cacheManager: AutoCacheManager<T>,
  cacheKey: string,
  operation: () => Promise<T>,
  ttl: number,
  enableAutoRefresh = false,
): Promise<T> => {
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

export const getServicesController = async (
  req: Request,
  res: Response,
): Promise<Response> => {
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
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error in getServicesController:", message);

    const statusCode = message?.includes("not found") ? 404 : 500;

    return res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

//pay bill controller

export const payBillController = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const payload = req.body as PayBillPayload;

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({
        success: false,
        message: "Invalid payment payload",
      });
    }

    if (req.user?.email) {
      payload.email = req.user.email;
    }

    const { raw, transaction } = await payBill(payload);

    const userEmail =
      payload.email || (payload as Record<string, unknown>).customer_email;
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

      data: raw,

      transaction,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error in payBillController:", message);

    const statusCode = message.toLowerCase().includes("not found") ? 404 : 500;

    return res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const getServiceVariationsController = async (
  req: Request,
  res: Response,
): Promise<Response> => {
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
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error in getServiceVariationsController:", message);

    const statusCode = message?.includes("not found") ? 404 : 500;

    return res.status(statusCode).json({
      success: false,
      message,
    });
  }
};

export const getBillsHistories = async (
  req: Request,
  res: Response,
): Promise<Response> => {
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

    if (req.user?.email && req.user.email !== normalizedEmail) {
      return res.status(403).json({
        message: "You can only view your own transaction history",
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

        return histories.map((history) => {
          const additionalData = history.additionalData as
            | Record<string, any>
            | undefined;
          const { category, label } = normalizeServiceLabel(
            history.serviceID || history.service,
            history.name,
          );
          return {
            _id: history._id,
            service: history.service,
            // `category` drives icon selection, `label` is the friendly
            // name shown in the list (e.g. "Data Purchase" instead of
            // "wallet" for every row).
            category,
            label,
            amount: history.amount,
            transactionReference: history.transactionReference,
            status: (history.status || "PENDING").toLowerCase(),
            receipentName: history.receipentName,
            receipentBank: history.receipentBank,
            // Normalize to lowercase "debit"/"credit" — the app filters
            // and colors rows off this exact casing.
            type: (history.type || "DEBIT").toLowerCase(),
            name: history.name,
            serviceID: history.serviceID,
            variation_code: history.variation_code,
            billersCode: history.billersCode,
            destinationBankName: history.destinationBankName,
            account_number: history.account_number,
            senderBank: history.senderBank,
            phone: additionalData?.content?.transactions?.phone || null,
            date: history.createdAt,
            unique_element:
              additionalData?.content?.transactions?.unique_element || null,
            transaction_id:
              additionalData?.content?.transactions?.transactionId || null,
            // Keep the raw provider value available for the receipt/detail
            // screen only — never use it as the primary display date.
            transaction_date: additionalData?.transaction_date || null,
            token: history.token || null,
            units: history.units || null,
            jambPin: history.jambPin || null,
            serialNumber: history.serialNumber || null,
            pin: history.pin || null,
          };
        });
      },
      CACHE_TTL.HISTORY,
      false,
    );

    return res.status(200).json(filteredHistories);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error fetching bill history:", message);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

// Export cache managers for monitoring
export { serviceCache, packageCache, historyCache };
