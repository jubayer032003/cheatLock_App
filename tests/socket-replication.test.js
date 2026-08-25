import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("multi-replica deployment configures a shared Socket.IO Redis adapter", () => {
  const deployment = fs.readFileSync("k8s/cheatlock-deployment.yaml", "utf8");
  const server = fs.readFileSync("backend/src/server.js", "utf8");
  const adapter = fs.readFileSync("backend/src/services/socketAdapter.js", "utf8");
  const socketClient = fs.readFileSync("web-dashboard/src/lib/socket.ts", "utf8");

  assert.match(deployment, /replicas:\s*3/);
  assert.match(server, /configureSocketAdapter\(io\)/);
  assert.match(adapter, /createAdapter\(publisher, subscriber\)/);
  assert.match(adapter, /required in production/);
  assert.match(socketClient, /transports:\s*\["websocket"\]/);
});

test("development Redis fallback cannot crash on unhandled adapter errors", () => {
  const adapter = fs.readFileSync(new URL("../backend/src/services/socketAdapter.js", import.meta.url), "utf8");
  assert.match(adapter, /publisher\.on\("error"/);
  assert.match(adapter, /subscriber\.on\("error"/);
  assert.match(adapter, /publisher\.disconnect\(\)/);
  assert.match(adapter, /config\.nodeEnv === "production"/);
});
