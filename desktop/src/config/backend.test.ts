import { describe, expect, it } from "vitest";
import {
  DEVELOPMENT_BACKEND_ORIGIN,
  PRODUCTION_BACKEND_ORIGIN,
  isLegacyDevelopmentOrigin,
  normalizeBackendOrigin,
  resolveBackendOrigin,
} from "./backend";

describe("desktop backend configuration", () => {
  it("defaults to the shared production backend used by other clients", () => {
    expect(resolveBackendOrigin()).toBe(PRODUCTION_BACKEND_ORIGIN);
  });

  it("allows explicit local backend overrides for development", () => {
    expect(resolveBackendOrigin(DEVELOPMENT_BACKEND_ORIGIN)).toBe(DEVELOPMENT_BACKEND_ORIGIN);
  });

  it("normalizes trailing slashes", () => {
    expect(normalizeBackendOrigin(`${PRODUCTION_BACKEND_ORIGIN}/`)).toBe(PRODUCTION_BACKEND_ORIGIN);
  });

  it("recognizes the legacy localhost desktop default", () => {
    expect(isLegacyDevelopmentOrigin("http://127.0.0.1:3000/")).toBe(true);
    expect(isLegacyDevelopmentOrigin("http://localhost:3000")).toBe(true);
  });
});
