import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";
import { Navigate } from "react-router-dom";

function ProtectedRoute({ children }) {
  // const { role } = useContext(AuthContext);

  // return role === "admin" ? children : <Navigate to="/login" />;
  return children;
}

export default ProtectedRoute;