import express from "express";
import bcrypt from "bcryptjs";
import { requireAuth, requirePermission, requireRole } from "../middleware/auth.js";
import { passwordResetRateLimiter } from "../middleware/rateLimiter.js";
import { Tenant } from "../models/Tenant.js";
import { User } from "../models/User.js";
import { AuditLog } from "../models/AuditLog.js";
import { generateResetToken, hashResetToken, resetTokenExpiryDate } from "./auth.js";
import { logger } from "../services/logger.js";

export const tenantsRouter = express.Router();

const TENANT_ADMIN_ROLES = ["INSTITUTION_ADMIN", "DEPARTMENT_ADMIN"];
const PROTECTED_ROLES = ["SUPER_ADMIN", ...TENANT_ADMIN_ROLES];

// Helper to log audit actions
async function writeAuditLog(req, action, details) {
  try {
    await AuditLog.create({
      tenantId: req.user.tenantId,
      userId: req.user.identifier,
      userRole: req.user.role,
      action,
      details,
      ipAddress: req.ip || "",
      userAgent: req.headers["user-agent"] || "",
    });
  } catch (err) {
    logger.error("Failed to write audit log.", { action, errorName: err.name || "AuditLogError" });
  }
}

// 1. Super Admin: List all tenants
tenantsRouter.get(
  "/",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  async (req, res, next) => {
    try {
      const tenants = await Tenant.find().lean();
      res.json({ tenants });
    } catch (err) {
      next(err);
    }
  }
);

// 2. Super Admin: Create a new tenant
tenantsRouter.post(
  "/",
  requireAuth,
  requireRole("SUPER_ADMIN"),
  async (req, res, next) => {
    try {
      const { name, slug, domain, licenseType } = req.body;
      const tenant = await Tenant.create({
        name,
        slug,
        domain,
        license: {
          type: licenseType || "trial",
          maxConcurrentStudents: licenseType === "enterprise" ? 500 : licenseType === "professional" ? 200 : 50,
        },
      });
      res.status(201).json({ tenant });
    } catch (err) {
      next(err);
    }
  }
);

// 3. Institution Admin: Get current tenant branding / settings
tenantsRouter.get(
  "/my-tenant",
  requireAuth,
  async (req, res, next) => {
    try {
      if (!req.user.tenantId) {
        // Fallback or Mock default tenant for dev compatibility
        let tenant = await Tenant.findOne({ slug: "default" });
        if (!tenant) {
          tenant = await Tenant.create({
            name: "Default University",
            slug: "default",
            branding: { logoUrl: "", primaryColor: "#8b5cf6", theme: "dark" },
          });
        }
        res.json({ tenant });
        return;
      }
      const tenant = await Tenant.findById(req.user.tenantId).lean();
      if (!tenant) {
        const error = new Error("Tenant organization not found.");
        error.status = 404;
        throw error;
      }
      res.json({ tenant });
    } catch (err) {
      next(err);
    }
  }
);

// 4. Institution Admin: Update tenant settings / branding
tenantsRouter.put(
  "/my-tenant",
  requireAuth,
  requirePermission("manage_settings"),
  async (req, res, next) => {
    try {
      const tenantId = req.user.tenantId || (await Tenant.findOne({ slug: "default" }))._id;
      const { name, branding, settings, departments } = req.body;

      const tenant = await Tenant.findByIdAndUpdate(
        tenantId,
        {
          $set: {
            name,
            branding,
            settings,
            departments,
          },
        },
        { new: true }
      ).lean();

      await writeAuditLog(req, "UPDATE_TENANT_SETTINGS", { name, branding, settings });
      res.json({ tenant });
    } catch (err) {
      next(err);
    }
  }
);

// 5. Institution Admin: Query audit logs
tenantsRouter.get(
  "/my-tenant/audit-logs",
  requireAuth,
  requirePermission("view_audit_logs"),
  async (req, res, next) => {
    try {
      const tenantId = req.user.tenantId || (await Tenant.findOne({ slug: "default" }))._id;
      const logs = await AuditLog.find({ tenantId }).sort({ createdAt: -1 }).limit(100).lean();
      res.json({ logs });
    } catch (err) {
      next(err);
    }
  }
);

// 6. User Management: List users in tenant
tenantsRouter.get(
  "/my-tenant/users",
  requireAuth,
  requirePermission("manage_users"),
  async (req, res, next) => {
    try {
      const tenantId = req.user.tenantId || (await Tenant.findOne({ slug: "default" }))._id;
      const users = await User.find({ tenantId })
        .select("-passwordHash")
        .sort({ createdAt: -1 })
        .lean();
      res.json({ users });
    } catch (err) {
      next(err);
    }
  }
);

// 7. User Management: Create single user
tenantsRouter.post(
  "/my-tenant/users",
  requireAuth,
  requirePermission("manage_users"),
  async (req, res, next) => {
    try {
      const tenantId = req.user.tenantId || (await Tenant.findOne({ slug: "default" }))._id;
      const { name, identifier, password, role, department, program, batch } = req.body;
      assertRoleCanBeManaged(req, role);

      const existing = await User.findOne({ identifier }).lean();
      if (existing) {
        const error = new Error("User identifier already registered.");
        error.status = 400;
        throw error;
      }

      const generatedPassword = password ? "" : generateTemporaryPassword();
      const passwordHash = await bcrypt.hash(password || generatedPassword, 10);
      const user = await User.create({
        name,
        identifier,
        passwordHash,
        role,
        tenantId,
        department,
        program,
        batch,
        mustChangePassword: !password,
        passwordChangedAt: new Date(),
        tokenVersion: 0,
      });

      await writeAuditLog(req, "CREATE_USER", { identifier, role });
      res.status(201).json({
        user: {
          id: user._id,
          name: user.name,
          identifier: user.identifier,
          role: user.role,
        },
        temporaryPassword: generatedPassword || undefined,
      });
    } catch (err) {
      next(err);
    }
  }
);

// 8. User Management: Bulk import CSV users
tenantsRouter.post(
  "/my-tenant/users/bulk-import",
  requireAuth,
  requirePermission("manage_users"),
  async (req, res, next) => {
    try {
      const tenantId = req.user.tenantId || (await Tenant.findOne({ slug: "default" }))._id;
      const { users } = req.body; // Expecting array of { name, identifier, role, department, program, batch }

      if (!Array.isArray(users) || users.length === 0) {
        const error = new Error("Invalid or empty users list.");
        error.status = 400;
        throw error;
      }

      const results = [];
      const skipped = [];
      const temporaryCredentials = [];

      for (const item of users) {
        const identifier = String(item.identifier || "").trim().toLowerCase();
        if (!identifier) continue;
        assertRoleCanBeManaged(req, item.role || "STUDENT");

        const existing = await User.findOne({ identifier }).lean();
        if (existing) {
          skipped.push(identifier);
          continue;
        }

        const temporaryPassword = generateTemporaryPassword();
        const passwordHash = await bcrypt.hash(temporaryPassword, 10);
        const created = await User.create({
          name: String(item.name || identifier).trim(),
          identifier,
          passwordHash,
          role: String(item.role || "STUDENT").toUpperCase(),
          tenantId,
          department: String(item.department || "").trim(),
          program: String(item.program || "").trim(),
          batch: String(item.batch || "").trim(),
          mustChangePassword: true,
          passwordChangedAt: new Date(),
          tokenVersion: 0,
        });
        results.push(created.identifier);
        temporaryCredentials.push({ identifier: created.identifier, temporaryPassword });
      }

      await writeAuditLog(req, "BULK_IMPORT_USERS", { count: results.length, skipped: skipped.length });
      res.json({
        importedCount: results.length,
        skippedCount: skipped.length,
        skipped,
        temporaryCredentials,
      });
    } catch (err) {
      next(err);
    }
  }
);

// 9. User Management: Toggle Suspension
tenantsRouter.put(
  "/my-tenant/users/:userId/status",
  requireAuth,
  requirePermission("manage_users"),
  async (req, res, next) => {
    try {
      const { status } = req.body;
      const targetUser = await findTenantUserById(req);
      assertRoleCanBeManaged(req, targetUser.role);
      await assertTenantAdminWillRemain(req, targetUser, status);

      const user = await User.findOneAndUpdate(
        tenantUserQuery(req),
        { $set: { status } },
        { new: true }
      ).lean();

      if (!user) {
        const error = new Error("User not found.");
        error.status = 404;
        throw error;
      }

      await writeAuditLog(req, "CHANGE_USER_STATUS", { userId: user.identifier, status });
      res.json({ success: true, status: user.status });
    } catch (err) {
      next(err);
    }
  }
);

// 10. User Management: Reset password
tenantsRouter.put(
  "/my-tenant/users/:userId/reset-password",
  passwordResetRateLimiter,
  requireAuth,
  requirePermission("manage_users"),
  async (req, res, next) => {
    try {
      const targetUser = await findTenantUserById(req);
      assertRoleCanBeManaged(req, targetUser.role);
      const resetToken = generateResetToken();
      const resetExpiresAt = resetTokenExpiryDate();

      const user = await User.findOneAndUpdate(
        tenantUserQuery(req),
        {
          $set: {
            passwordResetTokenHash: hashResetToken(resetToken),
            passwordResetExpiresAt: resetExpiresAt,
            passwordResetRequestedAt: new Date(),
            mustChangePassword: true,
          },
          $inc: { tokenVersion: 1 },
        },
        { new: true }
      ).lean();

      if (!user) {
        const error = new Error("User not found.");
        error.status = 404;
        throw error;
      }

      await writeAuditLog(req, "RESET_USER_PASSWORD", { userId: user.identifier });
      res.json({
        success: true,
        resetToken,
        expiresAt: resetExpiresAt.toISOString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// 11. User Management: Delete user
tenantsRouter.delete(
  "/my-tenant/users/:userId",
  requireAuth,
  requirePermission("manage_users"),
  async (req, res, next) => {
    try {
      const targetUser = await findTenantUserById(req);
      assertRoleCanBeManaged(req, targetUser.role);
      await assertTenantAdminWillRemain(req, targetUser, "DELETED");

      const user = await User.findOneAndDelete(tenantUserQuery(req)).lean();
      if (!user) {
        const error = new Error("User not found.");
        error.status = 404;
        throw error;
      }

      await writeAuditLog(req, "DELETE_USER", { userId: user.identifier });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

function tenantUserQuery(req) {
  const tenantId = requireAuthenticatedTenantId(req);
  return {
    _id: req.params.userId,
    tenantId,
  };
}

function generateTemporaryPassword() {
  return `CL-${generateResetToken().slice(0, 18)}-${generateResetToken().slice(0, 6)}`;
}

function requireAuthenticatedTenantId(req) {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    const error = new Error("Tenant context is required.");
    error.status = 403;
    throw error;
  }
  return tenantId;
}

async function findTenantUserById(req) {
  const user = await User.findOne(tenantUserQuery(req)).lean();
  if (!user) {
    const error = new Error("User not found.");
    error.status = 404;
    throw error;
  }
  return user;
}

function assertRoleCanBeManaged(req, role) {
  const normalizedRole = String(role || "").trim().toUpperCase();
  if (normalizedRole === "SUPER_ADMIN") {
    const error = new Error("This user role cannot be managed from tenant user management.");
    error.status = 403;
    throw error;
  }

  if (PROTECTED_ROLES.includes(normalizedRole) && req.user?.role !== "SUPER_ADMIN") {
    const error = new Error("This user role cannot be managed by this administrator.");
    error.status = 403;
    throw error;
  }
}

async function assertTenantAdminWillRemain(req, targetUser, nextStatus) {
  const normalizedStatus = String(nextStatus || "").trim().toUpperCase();
  const disablesTarget = normalizedStatus === "DELETED" || (normalizedStatus && normalizedStatus !== "ACTIVE");
  if (!disablesTarget || !TENANT_ADMIN_ROLES.includes(targetUser.role)) return;

  const activeAdminCount = await User.countDocuments({
    tenantId: requireAuthenticatedTenantId(req),
    _id: { $ne: targetUser._id },
    role: { $in: TENANT_ADMIN_ROLES },
    status: "ACTIVE",
  });

  if (activeAdminCount === 0) {
    const error = new Error("At least one active tenant administrator is required.");
    error.status = 403;
    throw error;
  }
}
