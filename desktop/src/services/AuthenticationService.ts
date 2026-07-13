import { apiClient } from "../api/client";
import { User } from "../types";

export class AuthenticationService {
  public static async login(identifier: string, password: string): Promise<{ token: string; user: User }> {
    try {
      const { data } = await apiClient.post<{ token: string; user: User }>("/auth/login", {
        identifier,
        password,
        role: "STUDENT",
      });
      return data;
    } catch (error: any) {
      const message = error.response?.data?.message || "Login authentication failed.";
      throw new Error(message);
    }
  }

  public static async signup(name: string, identifier: string, password: string): Promise<{ token: string; user: User }> {
    try {
      const { data } = await apiClient.post<{ token: string; user: User }>("/auth/signup", {
        name,
        identifier,
        password,
        role: "STUDENT",
      });
      return data;
    } catch (error: any) {
      const message = error.response?.data?.message || "Signup failed. Please try again.";
      throw new Error(message);
    }
  }

  public static async getCurrentUser(): Promise<User> {
    try {
      const { data } = await apiClient.get<{ user: User }>("/auth/me");
      return data.user;
    } catch (error: any) {
      const message = error.response?.data?.message || "Failed to retrieve current user session.";
      throw new Error(message);
    }
  }
}
