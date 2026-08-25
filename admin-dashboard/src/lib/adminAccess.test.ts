import assert from "node:assert/strict";
import test from "node:test";
import { ADMIN_ROLES, canEnterAdminDashboard, isAdminRole } from "./adminAccess.ts";

test("admin role allowlist matches central admin roles", () => {
  assert.deepEqual(ADMIN_ROLES, ["SUPER_ADMIN", "INSTITUTION_ADMIN", "DEPARTMENT_ADMIN"]);
  assert.equal(isAdminRole("SUPER_ADMIN"), true);
  assert.equal(isAdminRole("INSTITUTION_ADMIN"), true);
  assert.equal(isAdminRole("DEPARTMENT_ADMIN"), true);
});

test("teacher and student roles cannot enter admin dashboard", () => {
  assert.equal(canEnterAdminDashboard({ name: "Teacher", identifier: "teacher@example.com", role: "TEACHER" }), false);
  assert.equal(canEnterAdminDashboard({ name: "Student", identifier: "student@example.com", role: "STUDENT" }), false);
});

test("authenticated admin user can enter admin dashboard", () => {
  assert.equal(canEnterAdminDashboard({ name: "Admin", identifier: "admin@example.com", role: "SUPER_ADMIN" }), true);
});
