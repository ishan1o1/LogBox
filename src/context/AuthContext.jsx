import { createContext, useState } from "react";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(
    JSON.parse(localStorage.getItem("user")) || null
  );
  const [role, setRole] = useState(localStorage.getItem("role") || null);

  const login = (role, user) => {
    setUser(user);
    setRole(role);
  };

  const logout = () => {
    setUser(null);
    setRole(null);
    localStorage.clear();
  };

  return (
    <AuthContext.Provider value={{ user, role, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};