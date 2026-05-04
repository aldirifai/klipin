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

type RouterLike = { push: (href: string) => void; replace?: (href: string) => void };

/**
 * Clears the auth token. If a `router` is provided, navigates to `redirectTo`
 * (default "/") via the App Router so there's no full-page reload / blank flash.
 * If no router is provided, the caller is responsible for navigating afterward.
 */
export function logout(router?: RouterLike, redirectTo: string = "/") {
  clearToken();
  if (router) {
    router.push(redirectTo);
  }
}
