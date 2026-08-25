import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { User } from "../models/User.js";
import { logger } from "../services/logger.js";

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret());
  } catch (err) {
    logger.debug("JWT verification failed.", { reason: err.name || "JWT_ERROR" });
    throw err;
  }
}

export async function requireAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    const error = new Error("Missing authorization token.");
    error.status = 401;
    next(error);
    return;
  }

  try {
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.sub).select("identifier role tenantId status tokenVersion passwordChangedAt").lean();
    if (!user) {
      const error = new Error("Account no longer exists.");
      error.status = 401;
      error.code = "AUTH_INVALID";
      next(error);
      return;
    }
    if (user.status && user.status !== "ACTIVE") {
      const error = new Error("Account is not active.");
      error.status = 403;
      error.code = "ACCOUNT_INACTIVE";
      next(error);
      return;
    }
    if (Number(decoded.tokenVersion || 0) !== Number(user.tokenVersion || 0)) {
      const error = new Error("Invalid or expired token.");
      error.status = 401;
      error.code = "AUTH_INVALID";
      next(error);
      return;
    }
    if (user.passwordChangedAt && decoded.iat && new Date(user.passwordChangedAt).getTime() > decoded.iat * 1000) {
      const error = new Error("Invalid or expired token.");
      error.status = 401;
      error.code = "AUTH_INVALID";
      next(error);
      return;
    }
    req.user = {
      ...decoded,
      identifier: user.identifier,
      role: user.role,
      tenantId: user.tenantId?.toString?.() || decoded.tenantId || null,
      status: user.status || "ACTIVE",
    };
    next();
  } catch (err) {
    const error = new Error(err.message === "Account is not active." ? err.message : "Invalid or expired token.");
    error.status = 401;
    error.code = err.code || "AUTH_INVALID";
    next(error);
  }
}

const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ["manage_tenants", "view_audit_logs", "manage_settings", "manage_users", "manage_exams"],
  INSTITUTION_ADMIN: ["view_audit_logs", "manage_settings", "manage_users", "manage_exams", "manage_courses"],
  DEPARTMENT_ADMIN: ["manage_users", "manage_exams", "manage_courses"],
  TEACHER: ["manage_exams", "manage_courses", "view_reports", "proctor_exams"],
  PROCTOR: ["proctor_exams", "view_reports"],
  STUDENT: ["take_exams"],
  OBSERVER: ["view_reports"],
  AUDITOR: ["view_audit_logs", "view_reports"]
};

export function requireRole(role) {
  return (req, _res, next) => {
    if (!req.user) {
      const error = new Error("Authentication required.");
      error.status = 401;
      next(error);
      return;
    }

    if (req.user.role === "SUPER_ADMIN" || req.user.role === "INSTITUTION_ADMIN") {
      next();
      return;
    }

    const allowedRoles = Array.isArray(role) ? role : [role];
    if (!allowedRoles.includes(req.user.role)) {
      const error = new Error("You do not have permission for this action.");
      error.status = 403;
      next(error);
      return;
    }

    next();
  };
}

export function requirePermission(permission) {
  return (req, _res, next) => {
    if (!req.user) {
      const error = new Error("Authentication required.");
      error.status = 401;
      next(error);
      return;
    }

    const permissions = ROLE_PERMISSIONS[req.user.role] || [];
    if (req.user.role === "SUPER_ADMIN" || permissions.includes(permission)) {
      next();
      return;
    }

    const error = new Error("Insufficient permissions to perform this action.");
    error.status = 403;
    next(error);
  };
}
