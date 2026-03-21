import { useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { AuthContext } from "../context/AuthContext";
import "../styles/auth.css";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const navigate = useNavigate();
  const { login } = useContext(AuthContext);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const res = await axios.post(
        "http://localhost:5001/api/auth/login",
        { email, password }
      );

      const { user } = res.data;
      const role = user.role.toLowerCase();

      login(role, user);
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("role", role);

      navigate("/dashboard");
    } catch (err) {
      setError("Login failed");
    }
  };

  return (
    <div className="container">
      <div className="card">
        <div className="left">LogBox</div>

        <div className="right">
          <h1>Login</h1>

          <form onSubmit={handleSubmit}>
            <input
              type="email"
              placeholder="Email"
              onChange={(e) => setEmail(e.target.value)}
            />

            <input
              type="password"
              placeholder="Password"
              onChange={(e) => setPassword(e.target.value)}
            />

            {error && <p className="error">{error}</p>}

            <button>Submit</button>
          </form>

          <p>
            Don't have an account? <a href="/signup">Signup</a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;