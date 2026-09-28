"use client";

import { ArrowLeft, Home, SearchX } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import Logo from "../components/Logo";

const NotFound = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="w-full max-w-2xl">
        <div className="bg-white border border-gray-200 shadow-xl rounded-lg overflow-hidden">
          <div className="border-b border-gray-200 bg-gradient-to-r from-[#1A2855]/5 to-[#7A1A2B]/5 px-6 py-5 sm:px-8">
            <Logo className="h-16 w-auto" showText={false} />
          </div>

          <div className="px-6 py-8 sm:px-8 sm:py-10">
            <div className="flex flex-col items-center text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-[#1A2855]/10 bg-[#1A2855]/5 text-[#1A2855]">
                <SearchX size={42} strokeWidth={1.8} />
              </div>

              <p className="mb-2 text-sm font-semibold uppercase tracking-wider text-[#7A1A2B]">
                Error 404
              </p>
              <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
                Pagina no encontrada
              </h1>
              <p className="mt-3 max-w-md text-sm leading-6 text-gray-500">
                La ruta que intentas abrir no existe, fue movida o no esta
                disponible para tu sesion actual.
              </p>

              <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-center">
                <Link
                  to="/dashboard"
                  className="btn btn-primary inline-flex items-center justify-center gap-2 shadow-sm"
                >
                  <Home size={18} />
                  Volver al Dashboard
                </Link>

                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="btn btn-secondary inline-flex items-center justify-center gap-2"
                >
                  <ArrowLeft size={18} />
                  Regresar
                </button>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          Si el problema continua, contacta con el administrador del sistema.
        </p>
      </div>
    </div>
  );
};

export default NotFound;
