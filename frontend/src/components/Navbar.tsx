import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { logout } from "../services/auth";
import logo from "../assets/idcs-logo.png";
import { Menu, X } from 'lucide-react';
import { useSidebar } from './SidebarContext';
import './Navbar.css';

interface NavbarProps {
  user: { username: string; email?: string } | null;
}

export default function Navbar({ user }: NavbarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isLoginPage = location.pathname === "/login";
  const { collapsed, toggle } = useSidebar();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <button className="navbar-toggle" onClick={toggle} aria-label="Toggle sidebar">
          {collapsed ? <Menu /> : <X />}
        </button>

        <Link to="/dashboard" className="navbar-logo">
          <img
            src={logo}
            alt="IDCS Logo"
            className="logo-image"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <span className="logo-text">IDCS</span>
        </Link>

        <div className="navbar-links">
          {user ? (
            <div className="user-menu">
              <span className="user-name">{user.username}</span>
              <button onClick={handleLogout} className="logout-btn">Logout</button>
            </div>
          ) : isLoginPage ? (
            <Link to="/" className="login-btn">Home</Link>
          ) : (
            <Link to="/login" className="login-btn">Login</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
