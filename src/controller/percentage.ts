import type { Request, Response } from "express";

export const percentage = (_req: Request, res: Response): void => {
  res.json({
    data: 3,
    tv: 2,
    electricity: 2,
    bank: 2,
  });
};
