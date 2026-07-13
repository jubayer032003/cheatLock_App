export class TokenManager {
  private static readonly TOKEN_KEY = "cheatlock_token";
  private static readonly REMEMBER_KEY = "cheatlock_remember_me";
  private static readonly USER_KEY = "cheatlock_user";

  public static saveToken(token: string, rememberMe: boolean) {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.REMEMBER_KEY, String(rememberMe));
  }

  public static getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  public static getRememberMe(): boolean {
    return localStorage.getItem(this.REMEMBER_KEY) === "true";
  }

  public static saveUser(user: any) {
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
  }

  public static getUser(): any | null {
    const raw = localStorage.getItem(this.USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  public static clear() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
  }

  public static initializeOnStart() {
    const rememberMe = this.getRememberMe();
    if (!rememberMe) {
      this.clear();
    }
  }
}
