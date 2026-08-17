import jwt from "jsonwebtoken";
import Admin from "../models/admin.js";
import type { Request, Response, NextFunction } from "express";

// ══════════════════════════════════════════════════════
// verifyAdminToken
//
// Protects every /api/admin/* route except /api/admin/auth/*.
// Distinct from the customer-facing verifyToken middleware —
// this checks role === "admin" AND re-confirms the admin still
// exists in the DB, so a deleted/revoked admin can't keep using
// a still-valid 7-day token.
//
// On success: req.admin = { id, email, role }
// ══════════════════════════════════════════════════════

interface AdminJwtPayload {
  id: string;
  email: string;
  role: string;
}

export const verifyAdminToken = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        success: false,
        message: "Access token missing",
      });
      return;
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      res.status(401).json({
        success: false,
        message: "Access token missing",
      });
      return;
    }

    let decoded: AdminJwtPayload;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET as string) as AdminJwtPayload;
    } catch (err) {
      if (err instanceof Error && err.name === "TokenExpiredError") {
        res.status(401).json({
          success: false,
          message: "Session expired, please sign in again",
        });
        return;
      }
      res.status(401).json({
        success: false,
        message: "Invalid token",
      });
      return;
    }

    if (decoded.role !== "admin") {
      res.status(403).json({
        success: false,
        message: "Admin access required",
      });
      return;
    }

    // Re-confirm the admin account still exists and hasn't been
    // deactivated since the token was issued. Cheap at ~1k admins/users
    // scale and closes the "revoked admin, still-valid token" gap.
    const admin = await Admin.findById(decoded.id).select("email role").lean();
    if (!admin) {
      res.status(401).json({
        success: false,
        message: "Admin account no longer exists",
      });
      return;
    }

    req.admin = { id: decoded.id, email: admin.email, role: admin.role };
    next();
  } catch (error) {
    console.error("Admin auth middleware error:", error);
    res.status(500).json({
      success: false,
      message: "Authentication check failed",
    });
  }
};
