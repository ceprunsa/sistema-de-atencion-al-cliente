"use client";

import { useAuth } from "../hooks/useAuth";

const Profile = () => {
  const { user } = useAuth();

  return (
    <div className="max-w-7xl mx-auto">
      <div className="bg-white shadow overflow-hidden rounded-lg">
        <div className="px-4 py-5 sm:px-6">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            Perfil de Usuario
          </h3>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            Información personal y detalles de la cuenta
          </p>
        </div>

        <div className="border-t border-gray-200">
          <div className="flex justify-center py-6">
            {user?.photoURL ? (
              <img
                src={user.photoURL || "/placeholder.svg"}
                alt={user.displayName || "Usuario"}
                className="h-32 w-32 rounded-full border-4 border-white shadow-lg object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="h-32 w-32 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-4xl font-bold border-4 border-white shadow-lg">
                {user?.email?.charAt(0).toUpperCase() || "U"}
              </div>
            )}
          </div>

          <dl>
            <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">
                Nombre completo
              </dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                {user?.displayName || "No especificado"}
              </dd>
            </div>
            <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">
                Correo electrónico
              </dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                {user?.email}
              </dd>
            </div>
            <div className="bg-gray-50 px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">Rol</dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                <span
                  className={`px-2 py-1 text-xs font-semibold rounded-full ${
                    user?.role === "admin"
                      ? "bg-green-100 text-green-800 border border-green-200"
                      : "bg-blue-100 text-blue-800 border border-blue-200"
                  }`}
                >
                  {user?.role === "admin" ? "Administrador" : "Usuario"}
                </span>
              </dd>
            </div>
            <div className="bg-white px-4 py-5 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-500">
                Fecha de registro
              </dt>
              <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">
                {user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString()
                  : "No disponible"}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
};

export default Profile;
