import "../styles/navbar.css";

function Navbar({ user, logout }) {
  return (
    <div className="navbar">
      <h2>LogBox</h2>

      <div className="nav-right">
        <span>{user?.name}</span>
        <button onClick={logout}>Logout</button>
      </div>
    </div>
  );
}

export default Navbar;