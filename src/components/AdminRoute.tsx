"use client";

import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import type { ReactNode } from "react";

interface AdminRouteProps {
  children: ReactNode;
}

const AdminRoute = ({ children }: AdminRouteProps) => {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();

  // Si aún estamos cargando y no hay usuario, mostrar un spinner pequeño
  if (loading && !user) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-t-2 border-primary"></div>
      </div>
    );
  }

  // Si el usuario no está autenticado, redirigir a login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Si el usuario no es administrador, redirigir a forbidden
  if (!isAdmin) {
    return <Navigate to="/forbidden" replace />;
  }

  // Si el usuario es administrador, mostrar el contenido protegido
  return <>{children}</>;
};

export default AdminRoute;
