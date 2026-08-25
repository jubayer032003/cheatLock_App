import axios from "axios";
import { defaultBackendOrigin, isLegacyDevelopmentOrigin, normalizeBackendOrigin } from "../config/backend";

export const DEFAULT_SERVER_URL = defaultBackendOrigin();

export function getServerUrl(): string {
  const stored = localStorage.getItem("cheatlock_server_url");
  if (!stored) return DEFAULT_SERVER_URL;
  if (isLegacyDevelopmentOrigin(stored) && DEFAULT_SERVER_URL !== normalizeBackendOrigin(stored)) {
    localStorage.removeItem("cheatlock_server_url");
    return DEFAULT_SERVER_URL;
  }
  return normalizeBackendOrigin(stored);
}

export function setServerUrl(url: string) {
  const normalized = normalizeBackendOrigin(url);
  localStorage.setItem("cheatlock_server_url", normalized);
  apiClient.defaults.baseURL = normalized;
}

export const apiClient = axios.create({
  baseURL: getServerUrl(),
  timeout: 60000,
});

let inMemoryAccessToken: string | null = null;

export function setApiAuthToken(token: string | null) {
  inMemoryAccessToken = token;
  if (token) {
    apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common.Authorization;
  }
}

apiClient.interceptors.request.use((config) => {
  if (inMemoryAccessToken && config.headers) {
    config.headers.Authorization = `Bearer ${inMemoryAccessToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      setApiAuthToken(null);
      window.dispatchEvent(new Event("cheatlock_unauthorized"));
    }
    return Promise.reject(error);
  }
);
