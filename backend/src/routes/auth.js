import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { loginRateLimiter, passwordResetRateLimiter, signupRateLimiter } from "../middleware/rateLimiter.js";
import { User } from "../models/User.js";
import { logger } from "../services/logger.js";
import { deleteStudentAccount } from "../services/accountDeletion.js";

export const authRouter = express.Router();

authRouter.post("/signup", signupRateLimiter, async (req, res, next) => {
  try {
    const { name, identifier: rawIdentifier, password, role: rawRole } = req.body;
    const identifier = normalizeIdentifier(rawIdentifier);
    const requestedRole = String(rawRole || "").toUpperCase().trim();
    const role = "STUDENT";

    if (!name || !identifier || !password) {
      const error = new Error("Name, identifier, and password are required.");
      error.status = 400;
      throw error;
    }

    if (requestedRole && requestedRole !== "STUDENT") {
      const error = new Error("Public signup is available for student accounts only. Staff accounts must be created by an administrator.");
      error.status = 403;
      throw error;
    }

    const existingUser = await User.findOne({
      identifier,
      role,
    });

    if (existingUser) {
      const error = new Error("Account already exists for this role.");
      error.status = 409;
      throw error;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name,
      identifier,
      passwordHash,
      role,
    });

    const token = jwt.sign(
      {
        sub: user._id.toString(),
        identifier: user.identifier,
        role: user.role,
        tokenVersion: user.tokenVersion || 0,
      },
      config.jwt.secret(),
      { expiresIn: config.jwt.expiresIn }
    );

    res.status(201).json({
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", loginRateLimiter, async (req, res, next) => {
  try {
    const { identifier: rawIdentifier, email, password, role: rawRole } = req.body;
    const identifier = normalizeIdentifier(rawIdentifier || email);
    const role = String(rawRole || "").toUpperCase().trim();

    logger.debug("Login attempt received.", { role, hasIdentifier: Boolean(identifier) });

    if (!identifier || !password || !role) {
      const error = new Error("Identifier/email, password, and role are required.");
      error.status = 400;
      throw error;
    }

    const validRoles = [
      "SUPER_ADMIN",
      "INSTITUTION_ADMIN",
      "DEPARTMENT_ADMIN",
      "TEACHER",
      "PROCTOR",
      "STUDENT",
      "OBSERVER",
      "AUDITOR"
    ];
    if (!validRoles.includes(role)) {
      const error = new Error("Invalid role.");
      error.status = 400;
      throw error;
    }

    let user = await User.findOne({
      identifier,
      role,
    });

    if (!user) {
      const legacyIdentifier = String(rawIdentifier || email || "")
        .trim()
        .toLowerCase();
      if (legacyIdentifier && legacyIdentifier !== identifier) {
        user = await User.findOne({ identifier: legacyIdentifier, role });
      }
    }

    if (!user) {
      const dashboardRoles = ["SUPER_ADMIN", "INSTITUTION_ADMIN", "DEPARTMENT_ADMIN", "TEACHER", "PROCTOR", "AUDITOR"];
      if (dashboardRoles.includes(role)) {
        user = await User.findOne({
          identifier,
          role: { $in: dashboardRoles }
        });
        if (!user) {
          const legacyIdentifier = String(rawIdentifier || email || "")
            .trim()
            .toLowerCase();
          if (legacyIdentifier && legacyIdentifier !== identifier) {
            user = await User.findOne({
              identifier: legacyIdentifier,
              role: { $in: dashboardRoles }
            });
          }
        }
      }
    }

    if (!user) {
      const error = new Error("Invalid credentials.");
      error.status = 401;
      error.code = "INVALID_CREDENTIALS";
      throw error;
    }

    if (!(await bcrypt.compare(password, user.passwordHash))) {
      const error = new Error("Invalid credentials.");
      error.status = 401;
      error.code = "INVALID_CREDENTIALS";
      throw error;
    }

    const token = jwt.sign(
      {
        sub: user._id.toString(),
        identifier: user.identifier,
        role: user.role,
        tokenVersion: user.tokenVersion || 0,
      },
      config.jwt.secret(),
      { expiresIn: config.jwt.expiresIn }
    );

    res.json({
      token,
      user: serializeUser(user),
    });

    logger.debug("Login successful.", { userId: user._id?.toString(), role: user.role });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/password-reset/complete", passwordResetRateLimiter, async (req, res, next) => {
  try {
    const token = String(req.body?.token || "").trim();
    const password = String(req.body?.password || "");
    assertPasswordPolicy(password);

    if (!token || token.length < 32) {
      const error = new Error("Invalid or expired password reset token.");
      error.status = 400;
      error.code = "INVALID_RESET_TOKEN";
      throw error;
    }

    const tokenHash = hashResetToken(token);
    const user = await User.findOne({
      passwordResetTokenHash: tokenHash,
      passwordResetExpiresAt: { $gt: new Date() },
    }).select("+passwordResetTokenHash +passwordResetExpiresAt passwordHash tokenVersion").lean();

    if (!user) {
      const error = new Error("Invalid or expired password reset token.");
      error.status = 400;
      error.code = "INVALID_RESET_TOKEN";
      throw error;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await User.findByIdAndUpdate(user._id, {
      $set: {
        passwordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
      },
      $unset: {
        passwordResetTokenHash: "",
        passwordResetExpiresAt: "",
      },
      $inc: { tokenVersion: 1 },
    });

    logger.info("Password reset completed.", { userId: user._id?.toString() });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub).lean();
    if (!user) {
      const error = new Error("Account no longer exists.");
      error.status = 404;
      throw error;
    }
    res.json({
      user: serializeUser(user),
    });
  } catch (error) {
    next(error);
  }
});

authRouter.delete("/account", requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.sub).select("+passwordHash identifier role");
    if (!user) {
      const error = new Error("Account no longer exists.");
      error.status = 404;
      error.code = "ACCOUNT_NOT_FOUND";
      throw error;
    }
    if (user.role !== "STUDENT") {
      const error = new Error("Managed staff accounts must be removed by an institution administrator.");
      error.status = 409;
      error.code = "MANAGED_ACCOUNT_DELETION_REQUIRED";
      throw error;
    }
    const password = String(req.body?.password || "");
    if (!password || !(await bcrypt.compare(password, user.passwordHash))) {
      const error = new Error("Current password is required to delete this account.");
      error.status = 401;
      error.code = "REAUTHENTICATION_REQUIRED";
      throw error;
    }

    await deleteStudentAccount(user);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

authRouter.get(
  "/face-profile",
  requireAuth,
  requireRole("STUDENT"),
  async (req, res, next) => {
    try {
      const user = await User.findById(req.user.sub).lean();
      if (!user) {
        const error = new Error("Account not found.");
        error.status = 404;
        throw error;
      }

      res.json({
        hasFaceProfile: Boolean(user.faceProfile?.descriptor?.length),
        updatedAt: user.faceProfile?.updatedAt || null,
      });
    } catch (error) {
      next(error);
    }
  }
);

authRouter.put(
  "/face-profile",
  requireAuth,
  requireRole("STUDENT"),
  async (req, res, next) => {
    try {
      const descriptor = parseDescriptor(req.body?.descriptor);
      const previewBase64 = String(req.body?.previewBase64 || "");

      if (descriptor.length < 6) {
        const error = new Error("A valid face descriptor is required.");
        error.status = 400;
        throw error;
      }

      await User.findByIdAndUpdate(req.user.sub, {
        $set: {
          "faceProfile.descriptor": descriptor,
          "faceProfile.previewBase64": previewBase64,
          "faceProfile.updatedAt": new Date(),
        },
      });

      res.json({
        ok: true,
        hasFaceProfile: true,
      });
    } catch (error) {
      next(error);
    }
  }
);

authRouter.post(
  "/face-profile/verify",
  requireAuth,
  requireRole("STUDENT"),
  async (req, res, next) => {
    try {
      const descriptor = parseDescriptor(req.body?.descriptor);
      const user = await User.findById(req.user.sub).lean();

      if (!user?.faceProfile?.descriptor?.length) {
        const error = new Error("No registered face profile found. Enroll face first.");
        error.status = 400;
        throw error;
      }

      const distance = descriptorDistance(user.faceProfile.descriptor, descriptor);
      const threshold = user.faceProfile.descriptor.length > 32 ? 1.05 : 0.42;
      res.json({
        ok: distance <= threshold,
        distance,
        threshold,
      });
    } catch (error) {
      next(error);
    }
  }
);

function normalizeIdentifier(rawValue) {
  return String(rawValue || "").trim().toLowerCase().replace(/\s+/g, "");
}

function serializeUser(user) {
  return {
    name: user.name,
    identifier: user.identifier,
    role: user.role,
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

export function generateResetToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export function resetTokenExpiryDate(now = new Date()) {
  const minutes = Number.isFinite(config.auth.resetTokenExpiresMinutes)
    ? config.auth.resetTokenExpiresMinutes
    : 30;
  return new Date(now.getTime() + Math.max(5, minutes) * 60 * 1000);
}

function assertPasswordPolicy(password) {
  if (password.length < 8) {
    const error = new Error("Password must be at least 8 characters.");
    error.status = 400;
    error.code = "WEAK_PASSWORD";
    throw error;
  }
}

function parseDescriptor(rawDescriptor) {
  const descriptor = Array.isArray(rawDescriptor)
    ? rawDescriptor
    : String(rawDescriptor || "")
        .split(",")
        .map((item) => Number(item.trim()));

  return descriptor.filter((value) => Number.isFinite(value)).slice(0, 512);
}

function descriptorDistance(reference, candidate) {
  const length = Math.min(reference.length, candidate.length);
  if (!length) return Number.POSITIVE_INFINITY;

  let total = 0;
  for (let index = 0; index < length; index += 1) {
    const delta = Number(reference[index]) - Number(candidate[index]);
    total += delta * delta;
  }

  return Math.sqrt(total / length);
}
