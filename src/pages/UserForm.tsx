"use client";

import { useState, useEffect, type FormEvent, type ChangeEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useUsers } from "../hooks/useUsers";
import { useAuth } from "../hooks/useAuth";
import toast from "react-hot-toast";
import type { User } from "../types";
import { ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { areasApi } from "../api/areas";

const UserForm = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userByIdQuery, saveUser, isSaving } = useUsers(id);
  const { user: currentUser } = useAuth();
  const { data: existingUser, isLoading } = userByIdQuery;
  const areasQuery = useQuery({ queryKey: ["areas"], queryFn: areasApi.list });

  // Cambiar el estado inicial para incluir solo email y rol
  const [formData, setFormData] = useState<Partial<User>>({
    email: "",
    accountName: "",
    firstName: "",
    middleName: "",
    paternalSurname: "",
    maternalSurname: "",
    phone: "",
    additionalEmail: "",
    areaId: "",
    role: "user" as const, // Especificar el tipo literal
  });

  useEffect(() => {
    if (existingUser) {
      setFormData({
        id: existingUser.id,
        email: existingUser.email || "",
        accountName: existingUser.accountName || "",
        firstName: existingUser.firstName || "",
        middleName: existingUser.middleName || "",
        paternalSurname: existingUser.paternalSurname || "",
        maternalSurname: existingUser.maternalSurname || "",
        phone: existingUser.phone || "",
        additionalEmail: existingUser.additionalEmail || "",
        areaId: existingUser.areaId || "",
        role: existingUser.role || "user",
      });
    }
  }, [existingUser]);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // Actualizar la función handleSubmit para usar el formato de Supabase
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!formData.email) {
      toast.error("El correo electrónico es requerido");
      return;
    }

    if (
      !formData.firstName?.trim() ||
      !formData.paternalSurname?.trim() ||
      !formData.maternalSurname?.trim()
    ) {
      toast.error("El primer nombre y ambos apellidos son obligatorios");
      return;
    }

    try {
      // Para usuarios administradores, establecer explícitamente el rol
      const userData: Partial<User> = {
        ...formData,
        // Asegurar que el rol sea del tipo correcto
        role: formData.role === "admin" ? "admin" : "user",
      };

      // Llamar a saveUser y esperar el resultado
      await saveUser(userData);

      toast.success(
        id
          ? "Usuario actualizado correctamente"
          : "Usuario creado correctamente",
      );
      navigate("/users");
    } catch (error) {
      console.error("Error al guardar usuario:", error);
      toast.error(
        error instanceof Error ? error.message : "Error al guardar usuario",
      );
    }
  };

  if (id && isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="md:grid md:grid-cols-3 md:gap-6">
        <div className="md:col-span-1">
          <div className="px-4 sm:px-0">
            <h3 className="text-lg font-medium leading-6 text-gray-900">
              {id ? "Editar Usuario" : "Nuevo Usuario"}
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              {id
                ? "Actualiza la información del usuario"
                : "Completa la información para crear un nuevo usuario"}
            </p>
          </div>
        </div>
        <div className="mt-5 md:mt-0 md:col-span-2">
          <form onSubmit={handleSubmit}>
            <div className="shadow overflow-hidden rounded-lg">
              <div className="px-4 py-5 bg-white sm:p-6">
                <div className="grid grid-cols-6 gap-6">
                  <div className="col-span-6 sm:col-span-3">
                    <label htmlFor="firstName" className="block text-sm font-medium text-gray-700">
                      Primer nombre
                    </label>
                    <input type="text" name="firstName" id="firstName" value={formData.firstName || ""} onChange={handleChange} required className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md" />
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <label htmlFor="middleName" className="block text-sm font-medium text-gray-700">
                      Segundo nombre <span className="text-gray-400">(opcional)</span>
                    </label>
                    <input type="text" name="middleName" id="middleName" value={formData.middleName || ""} onChange={handleChange} className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md" />
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <label htmlFor="paternalSurname" className="block text-sm font-medium text-gray-700">
                      Apellido paterno
                    </label>
                    <input type="text" name="paternalSurname" id="paternalSurname" value={formData.paternalSurname || ""} onChange={handleChange} required className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md" />
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <label htmlFor="maternalSurname" className="block text-sm font-medium text-gray-700">
                      Apellido materno
                    </label>
                    <input type="text" name="maternalSurname" id="maternalSurname" value={formData.maternalSurname || ""} onChange={handleChange} required className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md" />
                  </div>
                  <div className="col-span-6 sm:col-span-4">
                    <label htmlFor="areaId" className="block text-sm font-medium text-gray-700">
                      Área <span className="text-gray-400">(opcional)</span>
                    </label>
                    <div className="relative">
                      <select
                        id="areaId"
                        name="areaId"
                        value={formData.areaId || ""}
                        onChange={handleChange}
                        disabled={areasQuery.isLoading}
                        className="appearance-none mt-1 block w-full pl-3 pr-10 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                        style={{ backgroundImage: "none" }}
                      >
                        <option value="">Sin área</option>
                        {(areasQuery.data || []).map((area) => (
                          <option key={area.id} value={area.id}>{area.name}</option>
                        ))}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 pt-1 text-gray-500 opacity-40">
                        <ChevronDown size={18} />
                      </div>
                    </div>
                  </div>
                  <div className="col-span-6 sm:col-span-4">
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Correo electrónico
                    </label>
                    <input
                      type="email"
                      name="email"
                      id="email"
                      value={formData.email || ""}
                      onChange={handleChange}
                      required
                      className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md"
                    />
                  </div>
                  <div className="col-span-6 sm:col-span-4">
                    <label htmlFor="additionalEmail" className="block text-sm font-medium text-gray-700">
                      Correo adicional <span className="text-gray-400">(opcional)</span>
                    </label>
                    <input type="email" name="additionalEmail" id="additionalEmail" value={formData.additionalEmail || ""} onChange={handleChange} className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md" />
                  </div>
                  {id && (
                    <div className="col-span-6 sm:col-span-4">
                      <label htmlFor="accountName" className="block text-sm font-medium text-gray-700">
                        Nombre de la cuenta de correo
                      </label>
                      <input type="text" name="accountName" id="accountName" value={formData.accountName || ""} onChange={handleChange} className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md" />
                      <p className="mt-1 text-xs text-gray-500">Nombre recibido del proveedor de autenticación.</p>
                    </div>
                  )}
                  <div className="col-span-6 sm:col-span-4">
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                      Teléfono <span className="text-gray-400">(opcional)</span>
                    </label>
                    <input type="tel" name="phone" id="phone" value={formData.phone || ""} onChange={handleChange} className="mt-1 focus:ring-blue-500 focus:border-blue-500 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md" />
                  </div>
                  <div className="col-span-6 sm:col-span-4">
                    <label
                      htmlFor="role"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Rol del usuario
                    </label>
                    <div className="relative">
                      <select
                        id="role"
                        name="role"
                        value={formData.role || "user"}
                        onChange={handleChange}
                        disabled={id === currentUser?.id}
                        className={`appearance-none mt-1 block w-full pl-3 pr-10 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-all duration-200 cursor-pointer hover:border-gray-400 ${
                          id === currentUser?.id
                            ? "bg-gray-50 text-gray-500 cursor-not-allowed opacity-75"
                            : ""
                        }`}
                        style={{ backgroundImage: "none" }}
                      >
                        <option value="user">Usuario</option>
                        <option value="admin">Administrador</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 pt-1 text-gray-500 opacity-40">
                        <ChevronDown size={18} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 bg-gray-50 text-right sm:px-6">
                <button
                  type="button"
                  onClick={() => navigate("/users")}
                  className="btn btn-secondary mr-3"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn btn-primary"
                >
                  {isSaving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UserForm;
