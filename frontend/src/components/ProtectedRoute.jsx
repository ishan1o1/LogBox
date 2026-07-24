import { useContext } from "react";
import { Navigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { getAccessToken } from "../services/apiClient";

/**
 * Protects a route behind authentication (and optionally a role check).
 *
 * Usage:
 *   <ProtectedRoute>                         // any authenticated user
 *   <ProtectedRoute allowedRoles={["ADMIN"]} // only ADMIN role
 *
 * If the user is not authenticated → redirect to /login
 * If the user lacks the required role → redirect to /dashboard (403-style)
 */
function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useContext(AuthContext);
  const token = getAccessToken();

  // Not authenticated — no token or no user in context
  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  // Role guard: if allowedRoles is provided, check membership
  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = (user.role || "").toUpperCase();
    if (!allowedRoles.map((r) => r.toUpperCase()).includes(userRole)) {
      // User is authenticated but lacks permission → send to dashboard
      return <Navigate to="/dashboard" replace />;
    }
  }

  return children;
}

export default ProtectedRoute;