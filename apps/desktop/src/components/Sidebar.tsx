import { NavLink } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";

const NAV_ITEMS = [
  { to: "/vod", label: "VOD", icon: "🎥" },
  { to: "/clips", label: "CLIPS", icon: "🔥" },
  { to: "/editor", label: "EDITOR", icon: "🎬" },
  { to: "/streamers", label: "STREAMERS", icon: "👤" },
  { to: "/settings", label: "CONFIGURAÇÕES", icon: "⚙️" },
];

export function Sidebar() {
  const role = useAuthStore((state) => state.user?.role);

  return (
    <nav className="sidebar">
      <div className="sidebar-title">LLZ CLIPPER</div>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
        >
          <span>{item.icon}</span> {item.label}
        </NavLink>
      ))}
      {role === "ADMIN" && (
        <NavLink to="/admin" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
          <span>🛠</span> ADMIN
        </NavLink>
      )}
    </nav>
  );
}
