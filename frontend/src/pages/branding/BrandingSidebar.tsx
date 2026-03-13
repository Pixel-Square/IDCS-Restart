import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  User,
  PlusCircle,
  CheckSquare,
  Clock,
  LogOut,
  Palette,
  ChevronLeft,
  ChevronRight,
  LayoutTemplate,
  Sparkles,
} from 'lucide-react';
import LogoutConfirmationModal from '../../components/LogoutConfirmationModal';

interface NavItem {
  key: string;
  label: string;
  to: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'profile',        label: 'Profile',         to: '/branding/profile',        icon: User           },
  { key: 'create',         label: 'Create',           to: '/branding/create',          icon: PlusCircle     },
  { key: 'event-approval', label: 'Event Approval',   to: '/branding/event-approval',  icon: CheckSquare    },
  { key: 'recents',        label: 'Recents',          to: '/branding/recents',         icon: Clock          },
  { key: 'poster-maker',   label: 'Canva Poster Maker', to: '/branding/poster-maker',  icon: Sparkles       },
  { key: 'templates',      label: 'Templates',        to: '/branding/templates',       icon: LayoutTemplate },
];

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

export default function BrandingSidebar({ collapsed, onToggle }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  function handleLogout() {
    localStorage.removeItem('branding_auth');
    localStorage.removeItem('branding_user');
    setShowLogoutModal(false);
    navigate('/login');
  }

  return (
    <>
      {/* Mobile overlay */}
      {!collapsed && (
        <div
          className="fixed inset-0 bg-black/40 z-20 lg:hidden"
          onClick={onToggle}
        />
      )}

      <aside
        className={`fixed top-0 left-0 h-full bg-gradient-to-b from-purple-900 to-purple-800 text-white shadow-2xl transition-all duration-300 z-30 flex flex-col
          ${collapsed ? '-translate-x-full lg:translate-x-0 lg:w-20' : 'w-72 lg:w-64'}`}
      >
        {/* Brand header */}
        <div className={`flex items-center p-4 border-b border-purple-700 ${collapsed ? 'lg:justify-center' : 'gap-3'}`}>
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Palette className="w-6 h-6 text-white" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="font-bold text-base leading-tight truncate">Branding</p>
              <p className="text-purple-300 text-xs truncate">IDCS College</p>
            </div>
          )}
          <button
            onClick={onToggle}
            className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg hover:bg-purple-700 transition-colors ml-auto flex-shrink-0"
            aria-label="Toggle sidebar"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          <ul className="space-y-1 px-2">
            {NAV_ITEMS.map(({ key, label, to, icon: Icon }) => {
              const active = location.pathname === to || location.pathname.startsWith(to + '/');
              return (
                <li key={key}>
                  <Link
                    to={to}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group
                      ${active
                        ? 'bg-white text-purple-900 shadow-md font-semibold'
                        : 'text-purple-100 hover:bg-purple-700/60 hover:text-white'
                      }
                      ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}
                    title={collapsed ? label : undefined}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-purple-700' : 'text-purple-300 group-hover:text-white'}`} />
                    {!collapsed && <span className="text-sm">{label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-purple-700">
          <button
            onClick={() => setShowLogoutModal(true)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-purple-200 hover:bg-red-600/80 hover:text-white transition-all duration-200
              ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}
            title={collapsed ? 'Logout' : undefined}
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="text-sm font-medium">Logout</span>}
          </button>
        </div>
      </aside>

      <LogoutConfirmationModal
        isOpen={showLogoutModal}
        onCancel={() => setShowLogoutModal(false)}
        onConfirm={handleLogout}
      />
    </>
  );
}
