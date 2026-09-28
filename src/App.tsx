"use client";

import { Outlet, useNavigate, useLocation } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import MobileHeader from "./components/MobileHeader";
import { Toaster, toast } from "react-hot-toast";
import { useAuthStore } from "./store/authStore";
import { useState, useEffect } from "react";
import appConfig from "./config/appConfig";

function App() {
  const { user, loading, initialized } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [localLoading, setLocalLoading] = useState(true);

  // Efecto para manejar la redirección y el estado de carga local
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const errorDescription = searchParams.get("error_description");
    const errorCode =
      searchParams.get("error_code") || searchParams.get("error");

    if (errorDescription || errorCode) {
      const message =
        errorDescription ||
        (errorCode === "access_denied"
          ? "No tienes autorización para ingresar a la aplicación."
          : "No se pudo completar la autenticación con Supabase.");

      toast.error(message, { id: "oauth-error", duration: 7_000 });
      searchParams.delete("error");
      searchParams.delete("error_code");
      searchParams.delete("error_description");

      const remainingSearch = searchParams.toString();
      navigate(
        {
          pathname: user ? location.pathname : "/login",
          search: remainingSearch ? `?${remainingSearch}` : "",
        },
        { replace: true },
      );
      return;
    }

    if (initialized) {
      if (!user && !loading && location.pathname !== "/login") {
        navigate("/login", { replace: true });
      }

      if (!loading) {
        const timer = setTimeout(() => {
          setLocalLoading(false);
        }, 150);
        return () => clearTimeout(timer);
      } else {
        setLocalLoading(true);
      }
    }
  }, [
    user,
    loading,
    initialized,
    navigate,
    location.pathname,
    location.search,
  ]);

  const handleOpenSidebar = () => {
    setSidebarOpen(true);
  };

  // Mostrar spinner durante la carga inicial
  if (
    !initialized ||
    (loading && !user) ||
    (localLoading && !user && location.pathname !== "/login")
  ) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-50 font-outfit">
        <div className="flex flex-col items-center gap-6">
          <div className="h-16 w-16 animate-spin rounded-full border-4 border-[#1A2855]/10 border-t-[#1A2855]"></div>
          <div className="text-center">
            <p className="text-lg font-bold text-[#1A2855] animate-pulse">
              {initialized && loading && !user && location.pathname !== "/login"
                ? "Cerrando sesión..."
                : "Cargando sistema..."}
            </p>
            <p className="text-sm text-gray-400 mt-1">{appConfig.fullName}</p>
          </div>
        </div>
        <Toaster position="top-right" />
      </div>
    );
  }

  // Sin usuario — el sistema de rutas maneja la redirección
  if (!user) {
    return (
      <div className="min-h-screen">
        <main className="container mx-auto px-4">
          <Outlet />
        </main>
        <Toaster position="top-right" />
      </div>
    );
  }

  // Con usuario — interfaz completa con sidebar
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row">
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

      <div className="flex-1 flex flex-col">
        <MobileHeader
          onOpenSidebar={handleOpenSidebar}
          appName="Aplicación-base"
        />

        <main className="container mx-auto px-4 py-8 flex-1">
          <Outlet />
        </main>
      </div>

      <Toaster position="top-right" />
    </div>
  );
}

export default App;
