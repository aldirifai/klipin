"use client";

import { useEffect, useState } from "react";
import { api, clearToken, getToken, type User } from "./api";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then((u) => setUser(u))
      .catch(() => {
        clearToken();
      })
      .finally(() => setLoading(false));
  }, []);

  return { user, loading };
}

export function logout() {
  clearToken();
  window.location.href = "/";
}
