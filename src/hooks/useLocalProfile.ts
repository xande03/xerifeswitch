import { useState, useCallback } from "react";

const USER_KEY = "xerife_local_user";

export interface LocalUser {
  id: string;
  name: string;
  picture: string;
  createdAt: number;
}

function generateId(): string {
  return "user_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 8);
}

export function useLocalProfile() {
  const [user, setUser] = useState<LocalUser | null>(() => {
    try {
      const saved = localStorage.getItem(USER_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const saveUser = useCallback((u: LocalUser | null) => {
    setUser(u);
    if (u) {
      localStorage.setItem(USER_KEY, JSON.stringify(u));
    } else {
      localStorage.removeItem(USER_KEY);
    }
  }, []);

  const login = useCallback(() => {
    const name = prompt("Digite seu nome de usuário:");
    if (name && name.trim()) {
      saveUser({
        id: generateId(),
        name: name.trim(),
        picture: "",
        createdAt: Date.now(),
      });
    }
  }, [saveUser]);

  const updateName = useCallback((name: string) => {
    setUser(prev => {
      if (!prev) return prev;
      const updated = { ...prev, name };
      localStorage.setItem(USER_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const logout = useCallback(() => {
    saveUser(null);
  }, [saveUser]);

  return { user, login, logout, updateName };
}
