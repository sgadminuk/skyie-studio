"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "./api";

interface User {
  id: string;
  email: string;
  name: string;
  plan: string;
  credits: number;
  avatar_url?: string;
  is_admin?: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("skyie_access_token");
    if (token) {
      api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      api.get("/auth/me")
        .then((res) => setUser(res.data))
        .catch(() => {
          localStorage.removeItem("skyie_access_token");
          localStorage.removeItem("skyie_refresh_token");
          delete api.defaults.headers.common["Authorization"];
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("skyie_access_token", data.access_token);
    localStorage.setItem("skyie_refresh_token", data.refresh_token);
    api.defaults.headers.common["Authorization"] = `Bearer ${data.access_token}`;
    setUser(data.user);
  }, []);

  const register = useCallback(async (email: string, password: string, name: string) => {
    const { data } = await api.post("/auth/register", { email, password, name });
    localStorage.setItem("skyie_access_token", data.access_token);
    localStorage.setItem("skyie_refresh_token", data.refresh_token);
    api.defaults.headers.common["Authorization"] = `Bearer ${data.access_token}`;
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("skyie_access_token");
    localStorage.removeItem("skyie_refresh_token");
    delete api.defaults.headers.common["Authorization"];
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      // ignore
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
