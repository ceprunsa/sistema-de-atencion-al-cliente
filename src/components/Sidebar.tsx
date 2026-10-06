"use client";

import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import Logo from "./Logo";
import { Building2, ClipboardPlus, Headphones, Home, Inbox, MonitorSmartphone, Users, X, LogOut, ChevronRight, User } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";
import ConfirmModal from "./ConfirmModal";
import { usePendingReferralCount } from "../hooks/useReferrals";

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const Sidebar = ({ isOpen, setIsOpen }: SidebarProps) => {
  const { user, logout, isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { pendingCount } = usePendingReferralCount();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const closeSidebar = () => {
    setIsOpen(false);
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      toast.loading("Cerrando sesión...", { id: "logout" });

      // Ejecutamos el logout real primero.
      // Esto activará el estado 'loading' en AuthContext
      await logout();

      // Una vez que el estado está limpio, navegamos
      navigate("/login", { replace: true });

      toast.success("Sesión cerrada correctamente", { id: "logout" });
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
      toast.error("Error al cerrar sesión. Intente nuevamente.", {
        id: "logout",
      });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
          onClick={closeSidebar}
        ></div>
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 z-40 h-screen transition-transform ${
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } bg-white shadow-lg w-64 md:sticky rounded-r-lg`}
      >
        <div className="h-full flex flex-col">
          {/* Sidebar header */}
          <div className="flex items-center justify-center p-4 border-b text-white rounded-tr-lg">
            <Link
              to="/dashboard"
              className="flex items-center"
              onClick={closeSidebar}
            >
              <Logo className="h-10 w-auto" />
            </Link>
            <button
              onClick={closeSidebar}
              className="p-2 rounded-md text-white hover:bg-[#3A4875] md:hidden transition-colors duration-200"
              aria-label="Cerrar sidebar"
            >
              <X size={20} />
            </button>
          </div>

          {/* User info */}
          <div className="p-4 border-b">
            <div className="flex items-center">
              {user?.photoURL ? (
                <img
                  src={user.photoURL || "/placeholder.svg"}
                  alt={user.displayName || "Usuario"}
                  className="h-10 w-10 rounded-full mr-3 border border-gray-200 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-lg font-medium mr-3 border border-gray-200">
                  {user?.email?.charAt(0).toUpperCase() || "U"}
                </div>
              )}
              <div className="overflow-hidden">
                <p className="font-medium text-gray-800 truncate">
                  {user?.displayName || user?.email}
                </p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
            </div>
            <div className="mt-2 text-center">
              <span
                className={`px-2 py-1 text-xs font-semibold rounded-full ${
                  user?.role === "admin"
                    ? "bg-green-100 text-green-800 border border-green-200"
                    : "bg-blue-100 text-blue-800 border border-blue-200"
                }`}
              >
                {user?.role === "admin" ? "Administrador" : "Usuario"}
              </span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 overflow-y-auto">
            <ul className="space-y-2">
              <li>
                <Link
                  to="/dashboard"
                  className={`flex items-center p-2 rounded-md hover:bg-gray-100 transition-colors duration-200 ${
                    isActive("/dashboard")
                      ? "bg-[#1A2855]/10 text-[#1A2855] font-medium"
                      : "text-gray-700"
                  }`}
                  onClick={closeSidebar}
                >
                  <Home size={18} className="mr-3" />
                  <span>Dashboard</span>
                  {isActive("/dashboard") && (
                    <ChevronRight size={16} className="ml-auto" />
                  )}
                </Link>
              </li>
              <li>
                <Link
                  to="/attentions"
                  className={`flex items-center p-2 rounded-md hover:bg-gray-100 transition-colors duration-200 ${
                    location.pathname.startsWith("/attentions")
                      ? "bg-[#1A2855]/10 text-[#1A2855] font-medium"
                      : "text-gray-700"
                  }`}
                  onClick={closeSidebar}
                >
                  <ClipboardPlus size={18} className="mr-3" />
                  <span>Atenciones</span>
                  {location.pathname.startsWith("/attentions") && (
                    <ChevronRight size={16} className="ml-auto" />
                  )}
                </Link>
              </li>
              <li>
                <Link
                  to="/referrals"
                  className={`flex items-center p-2 rounded-md hover:bg-gray-100 transition-colors duration-200 ${
                    location.pathname.startsWith("/referrals")
                      ? "bg-[#1A2855]/10 text-[#1A2855] font-medium"
                      : "text-gray-700"
                  }`}
                  onClick={closeSidebar}
                >
                  <Inbox size={18} className="mr-3" />
                  <span>Derivaciones</span>
                  <span className="ml-auto flex items-center gap-2">
                    {pendingCount > 0 && (
                      <span
                        className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold leading-none text-white"
                        title={`${pendingCount} derivación${pendingCount === 1 ? "" : "es"} pendiente${pendingCount === 1 ? "" : "s"} para tu área`}
                        aria-label={`${pendingCount} derivaciones pendientes`}
                      >
                        {pendingCount > 99 ? "99+" : pendingCount}
                      </span>
                    )}
                    {location.pathname.startsWith("/referrals") && <ChevronRight size={16} />}
                  </span>
                </Link>
              </li>
              {isAdmin && (
                <>
                  <li>
                    <Link
                      to="/workstations"
                      className={`flex items-center p-2 rounded-md hover:bg-gray-100 transition-colors duration-200 ${
                        isActive("/workstations") ? "bg-[#1A2855]/10 text-[#1A2855] font-medium" : "text-gray-700"
                      }`}
                      onClick={closeSidebar}
                    >
                      <MonitorSmartphone size={18} className="mr-3" />
                      <span>Mesas de trabajo</span>
                      {isActive("/workstations") && <ChevronRight size={16} className="ml-auto" />}
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/users"
                      className={`flex items-center p-2 rounded-md hover:bg-gray-100 transition-colors duration-200 ${
                        location.pathname.startsWith("/users")
                          ? "bg-[#1A2855]/10 text-[#1A2855] font-medium"
                          : "text-gray-700"
                      }`}
                      onClick={closeSidebar}
                    >
                      <Users size={18} className="mr-3" />
                      <span>Usuarios</span>
                      {location.pathname.startsWith("/users") && (
                        <ChevronRight size={16} className="ml-auto" />
                      )}
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/areas"
                      className={`flex items-center p-2 rounded-md hover:bg-gray-100 transition-colors duration-200 ${
                        isActive("/areas")
                          ? "bg-[#1A2855]/10 text-[#1A2855] font-medium"
                          : "text-gray-700"
                      }`}
                      onClick={closeSidebar}
                    >
                      <Building2 size={18} className="mr-3" />
                      <span>Áreas</span>
                      {isActive("/areas") && (
                        <ChevronRight size={16} className="ml-auto" />
                      )}
                    </Link>
                  </li>
                  <li>
                    <Link
                      to="/service-channels"
                      className={`flex items-center p-2 rounded-md hover:bg-gray-100 transition-colors duration-200 ${
                        isActive("/service-channels")
                          ? "bg-[#1A2855]/10 text-[#1A2855] font-medium"
                          : "text-gray-700"
                      }`}
                      onClick={closeSidebar}
                    >
                      <Headphones size={18} className="mr-3" />
                      <span>Medios de atención</span>
                      {isActive("/service-channels") && (
                        <ChevronRight size={16} className="ml-auto" />
                      )}
                    </Link>
                  </li>
                </>
              )}
              <li>
                <Link
                  to="/profile"
                  className={`flex items-center p-2 rounded-md hover:bg-gray-100 transition-colors duration-200 ${
                    isActive("/profile")
                      ? "bg-[#1A2855]/10 text-[#1A2855] font-medium"
                      : "text-gray-700"
                  }`}
                  onClick={closeSidebar}
                >
                  <User size={18} className="mr-3" />
                  <span>Perfil</span>
                  {isActive("/profile") && (
                    <ChevronRight size={16} className="ml-auto" />
                  )}
                </Link>
              </li>
            </ul>
          </nav>

          {/* Sidebar footer */}
          <div className="p-4 border-t">
            <button
              onClick={() => setShowLogoutConfirm(true)}
              disabled={isLoggingOut}
              className="flex items-center w-full p-2 rounded-md text-[#7A1A2B] hover:bg-[#7A1A2B]/10 transition-colors duration-200 disabled:opacity-50"
            >
              <LogOut size={18} className="mr-3" />
              <span>Cerrar sesión</span>
            </button>
          </div>
        </div>
      </aside>

      <ConfirmModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={() => {
          setShowLogoutConfirm(false);
          handleLogout();
        }}
        title="Cerrar Sesión"
        message="¿Estás seguro de que deseas cerrar tu sesión actual? Tendrás que volver a ingresar para acceder a tu panel."
        confirmLabel="Cerrar Sesión"
        isDanger={true}
      />
    </>
  );
};

export default Sidebar;
