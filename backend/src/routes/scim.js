import express from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const scimRouter = express.Router();

// SCIM Standard headers
scimRouter.use((_req, res, next) => {
  res.setHeader("Content-Type", "application/scim+json");
  next();
});

// 1. SCIM Users Listing
scimRouter.get(
  "/Users",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  async (req, res, next) => {
    try {
      const users = await User.find().lean();
      const resources = users.map((user) => ({
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        id: user._id.toString(),
        userName: user.identifier,
        name: {
          formatted: user.name,
        },
        active: user.status === "ACTIVE",
      }));

      res.json({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        totalResults: resources.length,
        itemsPerPage: resources.length,
        startIndex: 1,
        Resources: resources,
      });
    } catch (err) {
      next(err);
    }
  }
);

// 2. SCIM User Provisioning (Create)
scimRouter.post(
  "/Users",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  async (req, res, next) => {
    try {
      const { userName, name, active, emails } = req.body;
      const email = emails?.[0]?.value || userName;

      const existing = await User.findOne({ identifier: email }).lean();
      if (existing) {
        res.status(409).json({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
          detail: "User already exists.",
          status: "409",
        });
        return;
      }

      const defaultHash = await bcrypt.hash("CheatLock123!", 10);
      const user = await User.create({
        name: name?.formatted || userName,
        identifier: email,
        passwordHash: defaultHash,
        role: "STUDENT",
        status: active !== false ? "ACTIVE" : "INACTIVE",
      });

      res.status(201).json({
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        id: user._id.toString(),
        userName: user.identifier,
        name: {
          formatted: user.name,
        },
        active: user.status === "ACTIVE",
      });
    } catch (err) {
      next(err);
    }
  }
);

// 3. SCIM User Update/Deactivation
scimRouter.put(
  "/Users/:id",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  async (req, res, next) => {
    try {
      const { active, name } = req.body;
      const status = active === false ? "INACTIVE" : "ACTIVE";

      const user = await User.findByIdAndUpdate(
        req.params.id,
        {
          $set: {
            status,
            name: name?.formatted,
          },
        },
        { new: true }
      ).lean();

      if (!user) {
        res.status(404).json({
          schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
          detail: "User not found.",
          status: "404",
        });
        return;
      }

      res.json({
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
        id: user._id.toString(),
        userName: user.identifier,
        active: user.status === "ACTIVE",
      });
    } catch (err) {
      next(err);
    }
  }
);
