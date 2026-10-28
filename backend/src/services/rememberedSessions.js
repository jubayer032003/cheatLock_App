import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { User } from "../models/User.js";
import { RememberedSession } from "../models/RememberedSession.js";

// Active devices remain signed in; devices unused for 90 days must sign in again.
const IDLE_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
export const hashSessionToken = (value) => crypto.createHash("sha256").update(value).digest("hex");
const validToken = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
function invalidSession() {
  return Object.assign(new Error("Please sign in again."), { status: 401, code: "SESSION_EXPIRED" });
}

export function createRememberedSessionService({
  sessions = RememberedSession,
  users = User,
  now = () => new Date(),
  signAccessToken = (user) => jwt.sign({
    sub: user._id.toString(), identifier: user.identifier, role: user.role,
    tokenVersion: user.tokenVersion || 0,
  }, config.jwt.secret(), { expiresIn: config.jwt.expiresIn }),
} = {}) {
  function assertActive(user) {
    if (!user) throw invalidSession();
    if (user.status && user.status !== "ACTIVE") {
      throw Object.assign(new Error("Account is not active."), { status: 403, code: "ACCOUNT_INACTIVE" });
    }
  }
  return {
    async issue(user) {
      assertActive(user);
      const refreshToken = crypto.randomBytes(32).toString("hex");
      const issuedAt = now();
      const expiresAt = new Date(issuedAt.getTime() + IDLE_LIFETIME_MS);
      await sessions.create({
        userId: user._id, tokenHash: hashSessionToken(refreshToken),
        tokenVersion: user.tokenVersion || 0, issuedAt, expiresAt,
      });
      return { refreshToken, refreshExpiresAt: expiresAt };
    },
    async refresh(refreshToken) {
      if (!validToken(refreshToken)) throw invalidSession();
      const tokenHash = hashSessionToken(refreshToken);
      const timestamp = now();
      const session = await sessions.findOne({ tokenHash, expiresAt: { $gt: timestamp } }).lean();
      if (!session) throw invalidSession();
      const user = await users.findById(session.userId).lean();
      if (!user || Number(user.tokenVersion || 0) !== session.tokenVersion ||
          (user.passwordChangedAt && new Date(user.passwordChangedAt) > new Date(session.issuedAt))) {
        await sessions.deleteOne({ tokenHash });
        throw invalidSession();
      }
      assertActive(user);
      const expiresAt = new Date(timestamp.getTime() + IDLE_LIFETIME_MS);
      // A concurrent logout must never recreate a revoked device session.
      const renewed = await sessions.findOneAndUpdate(
        { _id: session._id, tokenHash, expiresAt: { $gt: timestamp } },
        { $set: { expiresAt } }, { new: true }
      ).lean();
      if (!renewed) throw invalidSession();
      // Keep the device secret stable so retrying a lost response remains safe.
      return { token: signAccessToken(user), user, refreshToken, refreshExpiresAt: expiresAt };
    },
    async revoke(refreshToken) {
      if (validToken(refreshToken)) await sessions.deleteOne({ tokenHash: hashSessionToken(refreshToken) });
    },
  };
}

export const rememberedSessions = createRememberedSessionService();
