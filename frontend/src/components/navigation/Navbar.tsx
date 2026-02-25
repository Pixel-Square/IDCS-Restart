import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { logout } from "../../services/auth";
import logo from "../../assets/idcs-logo.png";
import { Menu, X, LogOut, Home, LogIn } from 'lucide-react';
import { useSidebar } from '../layout/SidebarContext';

interface NavbarProps {
  user: { username: string; email?: string; profile_type?: string; profile?: any } | null;
}

export default function Navbar({ user }: NavbarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isLoginPage = location.pathname === "/login";
  const isHomePage = location.pathname === "/";
  const { collapsed, toggle } = useSidebar();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // Get role-specific ID display
  const getUserDisplayId = () => {
    if (!user) return null;
    
    const profileType = (user.profile_type || '').toUpperCase();
    
    if (profileType === 'STUDENT' && user.profile?.reg_no) {
      return user.profile.reg_no;
    }
    
    if (profileType === 'STAFF' && user.profile?.staff_id) {
      return user.profile.staff_id;
    }
    
    return user.username;
  };

  const displayId = getUserDisplayId();

  return (
    <nav className="bg-white shadow-md border-b border-gray-200 fixed top-0 left-0 right-0 z-40 overflow-x-hidden">
      <div className="px-4 max-w-full">
        <div className="flex items-center justify-between h-16">
          {/* Left Section: Toggle + Logo */}
          <div className="flex items-center gap-4">
            {!isLoginPage && !isHomePage && (
              <button
                className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={toggle}
                aria-label="Toggle sidebar"
              >
                {collapsed ? <Menu className="h-6 w-6" /> : <X className="h-6 w-6" />}
              </button>
            )}

            <Link to="/dashboard" className="flex items-center gap-3 group">
              <img
                src={logo}
                alt="IDCS Logo"
                className="h-12 w-12 object-contain transition-transform duration-200 group-hover:scale-110"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </Link>
          </div>
          {/* Right Section: User Menu or Login */}
          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-4">
                <div className="hidden sm:block">
                 <div className="px-3 py-2 bg-blue-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">{displayId}</span>
                </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg font-medium transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
            ) : (!isLoginPage && !isHomePage) ? (
              <Link
                to="/login"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all duration-200 shadow-sm hover:shadow-md transform hover:scale-105"
              >
                <LogIn className="h-4 w-4" />
                <span>Login</span>
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </nav>
  );
}
