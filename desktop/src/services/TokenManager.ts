import type { User } from "../types";
import { SecureStorageService } from "./SecureStorageService";

export class TokenManager {
  private static readonly TOKEN_KEY = "cheatlock.auth.access_token";
  private static readonly REFRESH_TOKEN_KEY = "cheatlock.auth.refresh_token";
  private static readonly USER_KEY = "cheatlock.auth.user";
  private static readonly LEGACY_TOKEN_KEY = "cheatlock_token";
  private static readonly LEGACY_REMEMBER_KEY = "cheatlock_remember_me";
  private static readonly LEGACY_USER_KEY = "cheatlock_user";

  public static async migrateLegacyLocalStorage(): Promise<boolean> {
    const legacyToken = localStorage.getItem(this.LEGACY_TOKEN_KEY);
    const legacyUser = localStorage.getItem(this.LEGACY_USER_KEY);
    if (!legacyToken && !legacyUser) return false;

    try {
      if (legacyToken) await SecureStorageService.set(this.TOKEN_KEY, legacyToken);
      if (legacyUser) await SecureStorageService.set(this.USER_KEY, legacyUser);
      localStorage.removeItem(this.LEGACY_TOKEN_KEY);
      localStorage.removeItem(this.LEGACY_USER_KEY);
      return true;
    } catch {
      return false;
    }
  }

  public static async saveToken(token: string, rememberMe: boolean, refreshToken?: string | null) {
    await SecureStorageService.set(this.TOKEN_KEY, token);
    if (refreshToken) await SecureStorageService.set(this.REFRESH_TOKEN_KEY, refreshToken);
    localStorage.setItem(this.LEGACY_REMEMBER_KEY, String(rememberMe));
  }

  public static async getToken(): Promise<string | null> {
    return SecureStorageService.get(this.TOKEN_KEY);
  }

  public static getRememberMe(): boolean {
    return localStorage.getItem(this.LEGACY_REMEMBER_KEY) === "true";
  }

  public static async saveUser(user: User) {
    const safeUser: User = {
      name: user.name,
      identifier: user.identifier,
      role: user.role,
      institutionName: user.institutionName,
    };
    await SecureStorageService.set(this.USER_KEY, JSON.stringify(safeUser));
  }

  public static async getUser(): Promise<User | null> {
    const raw = await SecureStorageService.get(this.USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      await SecureStorageService.delete(this.USER_KEY);
      return null;
    }
  }

  public static async clear() {
    await Promise.all([
      SecureStorageService.delete(this.TOKEN_KEY),
      SecureStorageService.delete(this.REFRESH_TOKEN_KEY),
      SecureStorageService.delete(this.USER_KEY),
    ]);
    localStorage.removeItem(this.LEGACY_TOKEN_KEY);
    localStorage.removeItem(this.LEGACY_USER_KEY);
  }

  public static async initializeOnStart() {
    await this.migrateLegacyLocalStorage();
    if (!this.getRememberMe()) {
      await this.clear();
    }
  }
}
