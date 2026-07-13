// Webhook Dispatcher Service for Event-Driven Integrations
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

const registeredWebhooks = new Map(); // EventName -> Array of webhook URLs

export function registerWebhook(eventName, callbackUrl) {
  const urls = registeredWebhooks.get(eventName) || [];
  if (!urls.includes(callbackUrl)) {
    urls.push(callbackUrl);
    registeredWebhooks.set(eventName, urls);
  }
}

export function unregisterWebhook(eventName, callbackUrl) {
  const urls = registeredWebhooks.get(eventName) || [];
  registeredWebhooks.set(eventName, urls.filter((url) => url !== callbackUrl));
}

export async function dispatchWebhook(eventName, payload) {
  const urls = registeredWebhooks.get(eventName) || [];
  if (urls.length === 0) return;

  const eventPayload = JSON.stringify({
    event: eventName,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  for (const callbackUrl of urls) {
    try {
      const url = new URL(callbackUrl);
      const protocol = url.protocol === "https:" ? https : http;

      const req = protocol.request(callbackUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(eventPayload),
          "X-CheatLock-Signature": "sha256_signature_mock_key_value",
        },
      });

      req.on("error", (err) => {
        console.error(`[Webhook] dispatch error to ${callbackUrl}:`, err.message);
      });

      req.write(eventPayload);
      req.end();
    } catch (err) {
      console.error(`[Webhook] invalid URL ${callbackUrl}:`, err.message);
    }
  }
}
