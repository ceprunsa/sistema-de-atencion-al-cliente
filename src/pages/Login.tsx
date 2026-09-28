"use client";

import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import Logo from "../components/Logo";
import toast from "react-hot-toast";
import backgroundImage from "../assets/ceprunsa_local.jpg";
import appConfig from "../config/appConfig";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";

const Login = () => {
  const {
    loginWithGoogle,
    recoverSession,
    user,
    loading,
    initialized,
    authError,
  } = useAuth();
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const navigate = useNavigate();
  const location = useLocation();
  const configurationBlocked = authError?.startsWith(
    "Configuración de Supabase inválida",
  );

  // Efecto para redirigir si el usuario ya está autenticado
  useEffect(() => {
    // Solo redirigimos si la autenticación se ha inicializado
    if (initialized && user && !loading) {
      // Verificar si hay una ruta de retorno en el estado de la ubicación
      const from = location.state?.from?.pathname || "/dashboard";
      navigate(from, { replace: true });
    }
  }, [user, loading, initialized, navigate, location]);

  useEffect(() => {
    if (!authError) return;

    toast.error(authError, { id: "auth-error", duration: 6_000 });
  }, [authError]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(
      window.location.hash.replace(/^#/, ""),
    );
    const errorDescription =
      searchParams.get("error_description") ||
      hashParams.get("error_description");
    const errorCode =
      searchParams.get("error_code") ||
      hashParams.get("error_code") ||
      searchParams.get("error") ||
      hashParams.get("error");

    if (!errorDescription && !errorCode) return;

    const message =
      errorDescription ||
      (errorCode === "access_denied"
        ? "No tienes autorización para ingresar a la aplicación."
        : "No se pudo completar la autenticación con Supabase.");

    toast.error(message, { id: "oauth-error", duration: 7_000 });

    const cleanUrl = `${window.location.pathname}${window.location.search
      ? `?${new URLSearchParams(
          [...searchParams].filter(([key]) => !key.startsWith("error")),
        ).toString()}`
      : ""}`;
    window.history.replaceState({}, document.title, cleanUrl.replace(/\?$/, ""));
  }, []);

  const handleGoogleLogin = async () => {
    if (isLoggingIn) return; // Prevenir múltiples clics

    try {
      setIsLoggingIn(true);
      toast.loading("Iniciando sesión...", { id: "login" });
      await loginWithGoogle();
      // No necesitamos navegar aquí, ya que Supabase OAuth redirige automáticamente
    } catch (error) {
      console.error("Error al iniciar sesión:", error);
      toast.error(
        error instanceof Error ? error.message : "Error al iniciar sesión",
        { id: "login" },
      );
      setIsLoggingIn(false);
    }
  };

  // Si aún no se ha inicializado la autenticación, estamos cargando, o ya hay un usuario (redirigiendo)
  if (!initialized || loading || user) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gray-50 font-outfit">
        <div className="h-20 w-20 animate-spin rounded-full border-4 border-[#1A2855]/10 border-t-[#1A2855]"></div>
        <div className="mt-8 text-center">
          <h2 className="text-xl font-bold text-[#1A2855] animate-pulse">
            {user ? "Redirigiendo al panel..." : "Verificando sesión..."}
          </h2>
          <p className="mt-2 text-gray-500 text-sm">
            Por favor, espera un momento.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full overflow-hidden flex items-center justify-center py-4 px-3 sm:px-6">
      {/* Fondo con imagen y overlay */}
      <div
        className="fixed inset-0 bg-cover bg-center -z-10"
        style={{
          backgroundImage: `url(${backgroundImage})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      >
        {/* Primera capa con color azul UNSA */}
        <div className="absolute inset-0 bg-[#1A2855] opacity-50"></div>

        {/* Segunda capa con gradiente usando los colores institucionales */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#1A2855]/80 via-[#7A1A2B]/40 to-[#1A2855]/70"></div>
      </div>

      {/* Contenido del login */}
      <div className="relative w-full max-w-4xl bg-white bg-opacity-95 rounded-lg shadow-2xl border border-gray-200 overflow-hidden">
        {/* Encabezado con logo y nombre de la aplicación */}
        <div className="flex flex-col items-center justify-center p-4 sm:p-6 border-b border-gray-200 bg-gradient-to-r from-[#1A2855]/5 to-[#7A1A2B]/5">
          <Logo className="h-16 sm:h-20 w-auto" showText={false} />
          <h1 className="mt-2 sm:mt-3 text-xl sm:text-2xl font-bold text-[#1A2855]">
            {appConfig.name}
          </h1>
          <p className="text-xs sm:text-sm text-gray-600">
            {appConfig.tagline}
          </p>
        </div>

        {/* Contenedor de dos columnas (una columna en móvil) */}
        <div className="flex flex-col md:flex-row">
          {/* Columna izquierda: Descripción de la aplicación */}
          <div className="p-4 md:p-6 md:w-1/2 md:border-r border-gray-200">
            <div className="mb-3 sm:mb-4">
              <h2 className="text-base sm:text-lg font-semibold text-[#7A1A2B] mb-1 sm:mb-2">
                Acerca de la aplicación
              </h2>
              <p className="text-xs sm:text-sm text-gray-600">
                {appConfig.description}
              </p>
            </div>

            <div className="bg-[#1A2855]/5 p-3 rounded-md border border-[#1A2855]/10 mb-3 sm:mb-4">
              <h3 className="text-xs sm:text-sm font-medium text-[#1A2855] mb-1 sm:mb-2">
                Características principales:
              </h3>
              <ul className="text-xs sm:text-sm text-gray-600 space-y-1 list-disc pl-4 sm:pl-5">
                {appConfig.features.map((feature, index) => (
                  <li key={index}>{feature.text}</li>
                ))}
              </ul>
            </div>

            <div className="hidden md:block text-xs text-gray-500">
              <p>
                {appConfig.supportText}
              </p>
            </div>
          </div>

          {/* Separador visible solo en móviles - MEJORADO */}
          <div className="relative md:hidden">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center">
              <div className="bg-gray-100 bg-opacity-95 px-4 py-1">
                <span className="text-lg font-semibold  text-[#7A1A2B]">
                  Iniciar sesión
                </span>
              </div>
            </div>
          </div>

          {/* Columna derecha: Inicio de sesión - CENTRADA */}
          <div className="p-4 md:p-6 md:w-1/2 flex flex-col justify-center items-center">
            {authError && (
              <div className="mb-4 w-full max-w-xs rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="text-xs leading-5">{authError}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!configurationBlocked && (
                    <button
                      type="button"
                      onClick={() => void recoverSession()}
                      className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-1 text-xs font-medium hover:bg-amber-100"
                    >
                      <Trash2 size={13} />
                      Limpiar sesión
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2 py-1 text-xs font-medium hover:bg-amber-100"
                  >
                    <RefreshCw size={13} />
                    Reintentar
                  </button>
                </div>
              </div>
            )}
            <div className="text-center mb-3 sm:mb-4 max-w-xs w-full">
              <h2 className="text-lg sm:text-xl font-semibold text-[#1A2855] md:block hidden">
                Iniciar sesión
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 mt-1 sm:mt-2">
                Utiliza tu cuenta institucional para acceder al sistema
              </p>
            </div>

            <div className="mb-4 sm:mb-6 max-w-xs w-full">
              <button
                onClick={handleGoogleLogin}
                disabled={isLoggingIn || configurationBlocked}
                className="group relative w-full flex justify-center py-2 sm:py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-[#7A1A2B] hover:bg-[#5A1420] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#7A1A2B] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
              >
                {isLoggingIn ? (
                  <span className="flex items-center">
                    <svg
                      className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Iniciando sesión...
                  </span>
                ) : (
                  <span className="flex items-center">
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M12.545,10.239v3.821h5.445c-0.712,2.315-2.647,3.972-5.445,3.972c-3.332,0-6.033-2.701-6.033-6.032s2.701-6.032,6.033-6.032c1.498,0,2.866,0.549,3.921,1.453l2.814-2.814C17.503,2.988,15.139,2,12.545,2C7.021,2,2.543,6.477,2.543,12s4.478,10,10.002,10c8.396,0,10.249-7.85,9.426-11.748L12.545,10.239z"
                      />
                    </svg>
                    {appConfig.loginButtonLabel}
                  </span>
                )}
              </button>
            </div>

            <div className="text-center text-xs text-gray-500 max-w-xs w-full">
              <p>
                Al iniciar sesión, aceptas nuestros términos y condiciones de
                uso.
              </p>
            </div>

            <div className="md:hidden text-center text-xs text-gray-500 mt-3">
              <p>
                {appConfig.supportText}
              </p>
            </div>

            <div className="mt-3 pt-3 border-t border-gray-200 text-center max-w-xs w-full">
              <p className="text-xs text-gray-500">
                © {new Date().getFullYear()} {appConfig.fullName}. Todos los derechos
                reservados.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
