import axios from "axios";

export const DEFAULT_SERVER_URL = "https://cheatlock-backend.onrender.com";

export function getServerUrl(): string {
  return localStorage.getItem("cheatlock_server_url") || DEFAULT_SERVER_URL;
}

export function setServerUrl(url: string) {
  const normalized = url.trim().replace(/\/$/, "");
  localStorage.setItem("cheatlock_server_url", normalized);
  apiClient.defaults.baseURL = normalized;
}

export const apiClient = axios.create({
  baseURL: getServerUrl(),
  timeout: 60000,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("cheatlock_token");
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("cheatlock_token");
      localStorage.removeItem("cheatlock_user");
      window.dispatchEvent(new Event("cheatlock_unauthorized"));
    }
    return Promise.reject(error);
  }
);
