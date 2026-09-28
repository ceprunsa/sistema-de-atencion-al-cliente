"use client";

import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { ReactNode } from "react";

interface ProtectedRouteProps {
  children: ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Si aún estamos cargando y no hay usuario, mostrar un spinner pequeño
  // Esto evita mostrar el spinner grande de la página completa
  if (loading && !user) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-primary"></div>
      </div>
    );
  }

  // Si el usuario no está autenticado, redirigir a login
  if (!user) {
    // Guardar la ubicación actual para redirigir después del login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Si el usuario está autenticado, mostrar el contenido protegido
  return <>{children}</>;
};

export default ProtectedRoute;
