import { createContext, useEffect, useState } from "react";
import { logoutSession, storeSession } from "../services/apiClient";

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem("user") || "null"));
  const [role, setRole] = useState(() => localStorage.getItem("role") || null);

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user") || "null");
    const storedRole = localStorage.getItem("role");

    if (storedUser && storedRole) {
      setUser(storedUser);
      setRole(storedRole);
    }
  }, []);

  const login = (session) => {
    const nextUser = session.user || session;
    setUser(nextUser);
    setRole(nextUser.role);
    storeSession({ ...session, user: nextUser });
  };

  const logout = () => {
    setUser(null);
    setRole(null);
    logoutSession();
  };

  return (
    <AuthContext.Provider value={{ user, role, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}