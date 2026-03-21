import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "../styles/auth.css";

function Signup() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    await axios.post("http://localhost:5001/api/auth/signup", form);
    alert("Signup successful");
    navigate("/login");
  };

  return (
    <div className="container">
      <div className="card">
        <div className="left">LogBox</div>


        <div className="right">
          <h1>Signup</h1>

          <form onSubmit={handleSubmit}>
            <input name="name" placeholder="Name" onChange={handleChange} />
            <input name="email" placeholder="Email" onChange={handleChange} />
            <input
              name="password"
              type="password"
              placeholder="Password"
              onChange={handleChange}
            />

            <button>Submit</button>
          </form>
          <p>
            Already have an account? <a href="/login">Login</a>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Signup;