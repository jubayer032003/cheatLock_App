import bcrypt from "bcryptjs";
import express from "express";
import jwt from "jsonwebtoken";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { User } from "../models/User.js";

export const authRouter = express.Router();

authRouter.post("/signup", async (req, res, next) => {
  try {
    const { name, identifier: rawIdentifier, password, role: rawRole } = req.body;
    const identifier = normalizeIdentifier(rawIdentifier);
    const role = String(rawRole || "").toUpperCase().trim();

    if (!name || !identifier || !password || !role) {
      const error = new Error("Name, identifier, password, and role are required.");
      error.status = 400;
      throw error;
    }

    if (!["STUDENT", "TEACHER"].includes(role)) {
      const error = new Error("Invalid role.");
      error.status = 400;
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
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.status(201).json({
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const { identifier: rawIdentifier, email, password, role: rawRole } = req.body;
    const identifier = normalizeIdentifier(rawIdentifier || email);
    const role = String(rawRole || "").toUpperCase().trim();

    console.debug("[auth.login] incoming request", {
      ip: req.ip,
      identifier: identifier ? identifier.replace(/(.+)@(.+)/, "***@***") : null,
      role,
    });

    if (!identifier || !password || !role) {
      const error = new Error("Identifier/email, password, and role are required.");
      error.status = 400;
      throw error;
    }

    if (!["STUDENT", "TEACHER"].includes(role)) {
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
      console.debug("[auth.login] no user found for identifier", identifier);
      const existingAccount = await User.findOne({ identifier }).select("role").lean();
      const error = new Error(
        existingAccount
          ? `This ID exists as ${existingAccount.role}, not ${role}.`
          : `No ${role.toLowerCase()} account found for this ID. Sign up first with the same role.`
      );
      error.status = 401;
      throw error;
    }

    if (!(await bcrypt.compare(password, user.passwordHash))) {
      console.debug("[auth.login] password mismatch for user", user._id?.toString());
      const error = new Error("Password is incorrect.");
      error.status = 401;
      throw error;
    }

    const token = jwt.sign(
      {
        sub: user._id.toString(),
        identifier: user.identifier,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    res.json({
      token,
      user: serializeUser(user),
    });

    console.debug("[auth.login] login successful for user", user._id?.toString());
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
  };
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
