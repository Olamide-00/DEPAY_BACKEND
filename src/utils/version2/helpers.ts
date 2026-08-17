import { v4 as uuidv4 } from "uuid";

export const generateTransactionReference = (): string => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `TXN-${timestamp}-${random}`;
};

export const generateTransactionId = (): string => uuidv4();

export const sanitizeInput = <T>(input: T): T => {
  if (typeof input === "string") {
    return (input as string).replace(/[$\{\}]/g, "") as unknown as T;
  }
  return input;
};

interface Timing {
  start: number;
  end: number | null;
  duration: number | null;
}

// Performance monitoring
export class PerformanceMonitor {
  static timings = new Map<string, Timing>();

  static start(operation: string): void {
    this.timings.set(operation, {
      start: Date.now(),
      end: null,
      duration: null,
    });
  }

  static end(operation: string): void {
    const timing = this.timings.get(operation);
    if (timing) {
      timing.end = Date.now();
      timing.duration = timing.end - timing.start;

      if (timing.duration > 5000) {
        console.warn(`Slow operation: ${operation} took ${timing.duration}ms`);
      }
    }
  }
}
