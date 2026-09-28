"use client";

import { useNavigate } from "react-router-dom";
import { ShieldAlert, ArrowLeft } from "lucide-react";

const Forbidden = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4 font-outfit">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-red-100 transition-all duration-300 hover:shadow-2xl">
        <div className="flex justify-center mb-6">
          <div className="p-4 bg-red-50 rounded-full text-red-500 animate-pulse">
            <ShieldAlert size={64} />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Acceso Denegado
        </h1>
        <p className="text-gray-500 mb-8">
          Lo sentimos, no tienes los permisos necesarios para acceder a esta
          página. Esta sección es exclusiva para administradores.
        </p>

        <button
          onClick={() => navigate("/dashboard")}
          className="w-full flex items-center justify-center gap-2 bg-[#1A2855] hover:bg-[#2A3865] text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 transform active:scale-95 shadow-lg shadow-[#1A2855]/20"
        >
          <ArrowLeft size={18} />
          Volver al Dashboard
        </button>

        <p className="mt-6 text-sm text-gray-400">
          Si crees que esto es un error, contacta con tu administrador.
        </p>
      </div>
    </div>
  );
};

export default Forbidden;
