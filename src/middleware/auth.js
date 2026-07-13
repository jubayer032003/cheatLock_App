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

export function requireRole(role) {
  return (req, _res, next) => {
    if (req.user?.role !== role) {
      const error = new Error("You do not have permission for this action.");
      error.status = 403;
      next(error);
      return;
    }

    next();
  };
}
