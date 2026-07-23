import { v4 as uuidv4 } from "uuid";

export const generateTransactionReference = () => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `TXN-${timestamp}-${random}`;
};

export const generateTransactionId = () => uuidv4();

export const sanitizeInput = (input) => {
  if (typeof input === 'string') {
    return input.replace(/[$\{\}]/g, '');
  }
  return input;
};

// Performance monitoring
export class PerformanceMonitor {
  static timings = new Map();

  static start(operation) {
    this.timings.set(operation, {
      start: Date.now(),
      end: null,
      duration: null
    });
  }

  static end(operation) {
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

//internal service
// export const generateTransactionReference = () => {
//   const timestamp = Date.now();
//   const random = Math.random().toString(36).substring(2, 10).toUpperCase();
//   return `TXN-${timestamp}-${random}`;
// };