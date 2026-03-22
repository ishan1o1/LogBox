import { useTheme } from "../context/ThemeContext";
import "../styles/Navbar.css";

function Navbar({ user, logout }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="navbar">
      <span className="navbar-brand">LogBox</span>

      <div className="nav-right">
        <button
          className="theme-toggle-btn"
          onClick={toggleTheme}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
        <span className="nav-user">{user?.name}</span>
        <button className="nav-logout-btn" onClick={logout}>Logout</button>
      </div>
    </div>
  );
}

export default Navbar;