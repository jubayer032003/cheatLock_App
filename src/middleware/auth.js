import jwt from "jsonwebtoken";

export function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    console.error("[auth.verifyToken] token verification failed:", err.message);
    throw err;
  }
}

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    const error = new Error("Missing authorization token.");
    error.status = 401;
    next(error);
    return;
  }

  try {
    console.debug("[auth.requireAuth] verifying token header:", header ? header.slice(0, 40) + "..." : "(empty)");
    req.user = verifyToken(token);
    console.debug("[auth.requireAuth] token verified; user:", req.user);
    next();
  } catch {
    const error = new Error("Invalid or expired token.");
    error.status = 401;
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
