import { beforeEach, describe, expect, it } from "vitest";
import { SecureStorageService, type SecureStorageAdapter } from "./SecureStorageService";
import { TokenManager } from "./TokenManager";

class FailingAdapter implements SecureStorageAdapter {
  async get(): Promise<string | null> {
    return null;
  }
  async set(): Promise<void> {
    throw new Error("secure storage failed");
  }
  async delete(): Promise<void> {}
}

beforeEach(() => {
  localStorage.clear();
  SecureStorageService.setAdapterForTests(null);
  SecureStorageService.clearMemoryForTests();
});

describe("TokenManager", () => {
  it("migrates legacy localStorage tokens into secure storage and deletes legacy values", async () => {
    localStorage.setItem("cheatlock_token", "legacy-token");
    localStorage.setItem("cheatlock_user", JSON.stringify({ name: "Amina", identifier: "stu-1", role: "STUDENT" }));

    await expect(TokenManager.migrateLegacyLocalStorage()).resolves.toBe(true);

    expect(await TokenManager.getToken()).toBe("legacy-token");
    expect((await TokenManager.getUser())?.identifier).toBe("stu-1");
    expect(localStorage.getItem("cheatlock_token")).toBeNull();
    expect(localStorage.getItem("cheatlock_user")).toBeNull();
  });

  it("keeps legacy values when migration fails", async () => {
    SecureStorageService.setAdapterForTests(new FailingAdapter());
    localStorage.setItem("cheatlock_token", "legacy-token");

    await expect(TokenManager.migrateLegacyLocalStorage()).resolves.toBe(false);

    expect(localStorage.getItem("cheatlock_token")).toBe("legacy-token");
  });

  it("deletes secure and legacy auth values on logout cleanup", async () => {
    await TokenManager.saveToken("token", true, "refresh");
    await TokenManager.saveUser({ name: "Amina", identifier: "stu-1", role: "STUDENT" });
    localStorage.setItem("cheatlock_token", "legacy-token");

    await TokenManager.clear();

    expect(await TokenManager.getToken()).toBeNull();
    expect(await TokenManager.getUser()).toBeNull();
    expect(localStorage.getItem("cheatlock_token")).toBeNull();
  });
});
