import { NavLink } from "react-router-dom";
import { Video, Flame, Film, Users, Settings, Shield } from "lucide-react";
import { useAuthStore } from "../stores/authStore";
import { Logo } from "./Logo";

const NAV_ITEMS = [
  { to: "/vod", label: "VOD", Icon: Video },
  { to: "/clips", label: "CLIPS", Icon: Flame },
  { to: "/editor", label: "EDITOR", Icon: Film },
  { to: "/streamers", label: "STREAMERS", Icon: Users },
  { to: "/settings", label: "CONFIGURAÇÕES", Icon: Settings },
];

export function Sidebar() {
  const role = useAuthStore((state) => state.user?.role);

  return (
    <nav className="sidebar">
      <div className="sidebar-title">
        <Logo />
      </div>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
        >
          <item.Icon size={18} aria-label={item.label} /> {item.label}
        </NavLink>
      ))}
      {role === "ADMIN" && (
        <NavLink to="/admin" className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}>
          <Shield size={18} aria-label="ADMIN" /> ADMIN
        </NavLink>
      )}
    </nav>
  );
}
