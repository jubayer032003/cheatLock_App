import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import dns from "node:dns";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { config } from "../src/config.js";
import { User } from "../src/models/User.js";

const rl = readline.createInterface({ input, output });

try {
  configureDnsOverride();

  const identifier = normalizeIdentifier(process.env.CHEATLOCK_SUPER_ADMIN_IDENTIFIER || await rl.question("Super admin email/identifier: "));
  const name = String(process.env.CHEATLOCK_SUPER_ADMIN_NAME || await rl.question("Super admin name: ")).trim();
  const password = String(process.env.CHEATLOCK_SUPER_ADMIN_PASSWORD || await rl.question("Temporary password: "));

  if (!identifier || !name || !password) {
    throw new Error("Identifier, name, and password are required.");
  }
  if (password.length < 12) {
    throw new Error("Temporary password must be at least 12 characters.");
  }

  await mongoose.connect(config.mongodb.uri(), { dbName: config.mongodb.dbName });

  const existing = await User.findOne({ identifier, role: "SUPER_ADMIN" });
  if (existing) {
    console.log(`SUPER_ADMIN already exists for ${identifier}. No password was changed.`);
    process.exitCode = 0;
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    await User.create({
      name,
      identifier,
      passwordHash,
      role: "SUPER_ADMIN",
      status: "ACTIVE",
      mustChangePassword: true,
    });
    console.log(`Created SUPER_ADMIN account for ${identifier}.`);
  }
} catch (error) {
  console.error(error.message || error);
  process.exitCode = 1;
} finally {
  rl.close();
  await mongoose.disconnect().catch(() => undefined);
}

function normalizeIdentifier(rawValue) {
  return String(rawValue || "").trim().toLowerCase().replace(/\s+/g, "");
}

function configureDnsOverride() {
  const servers = String(process.env.MONGODB_DNS_SERVERS || "")
    .split(",")
    .map((server) => server.trim())
    .filter(Boolean);

  if (servers.length > 0) {
    dns.setServers(servers);
  }
}
