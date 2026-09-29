"use client";

import { useUsers } from "../hooks/useUsers";
import { useAuth } from "../hooks/useAuth";
import toast from "react-hot-toast";
import type { User, UserInvitation, Role } from "../types";
import { Plus, Trash2, Loader2, ChevronDown, Mail, Pencil } from "lucide-react";
import ConfirmModal from "../components/ConfirmModal";
import Pagination from "../components/Pagination";
import { useState } from "react";
import { Link } from "react-router-dom";
import { formatLocalDate } from "../utils/dateUtils";

// ─── Componente: tabla de usuarios registrados ─────────────────
const UsersTable = ({
  users,
  currentUserId,
  rolesData,
  isUpdatingRole,
  updatingId,
  onDeleteClick,
  onRoleChange,
}: {
  users: User[];
  currentUserId?: string;
  rolesData: Role[];
  isUpdatingRole: boolean;
  updatingId: string | null;
  onDeleteClick: (u: User) => void;
  onRoleChange: (u: User, roleKey: string) => void;
}) => (
  <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-100">
    {users.length === 0 ? (
      <div className="p-8 text-center text-gray-400 italic">
        No hay usuarios registrados
      </div>
    ) : (
      <div className="divide-y divide-gray-200">
        {/* Header */}
        <div className="hidden xl:grid xl:grid-cols-12 bg-gray-50 px-6 py-3 rounded-t-lg">
          <div className="xl:col-span-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
            Nombre
          </div>
          <div className="xl:col-span-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
            Email
          </div>
          <div className="xl:col-span-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
            Área
          </div>
          <div className="xl:col-span-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
            Rol
          </div>
          <div className="xl:col-span-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
            Fecha de registro
          </div>
          <div className="xl:col-span-1 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
            Acciones
          </div>
        </div>

        {users.map((user, index) => (
          <div
            key={user.id}
            className={`p-4 xl:p-0 hover:bg-gray-50 transition-colors duration-150 ${index === users.length - 1 ? "rounded-b-lg" : ""}`}
          >
            {/* Desktop row */}
            <div className="hidden xl:grid xl:grid-cols-12 xl:items-center xl:px-6 xl:py-4">
              <div className="xl:col-span-3">
                <div className="flex items-center">
                  {user.photoURL ? (
                    <img
                      className="h-10 w-10 rounded-full object-cover border border-gray-200"
                      src={user.photoURL}
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-lg font-medium border border-gray-200">
                      {user.email?.charAt(0).toUpperCase() || "U"}
                    </div>
                  )}
                  <div className="ml-4 text-sm font-medium text-gray-900">
                    {user.displayName || user.email}
                  </div>
                </div>
              </div>
              <div className="xl:col-span-2 text-sm text-gray-900 truncate pr-3">
                {user.email}
              </div>
              <div className="xl:col-span-2 text-sm text-gray-600">
                {user.area?.name || "Sin área"}
              </div>
              <div className="xl:col-span-2 relative">
                {updatingId === user.id ? (
                  <div className="flex items-center text-gray-400 text-xs py-2">
                    <Loader2 size={14} className="animate-spin mr-1" />
                    Actualizando...
                  </div>
                ) : (
                  <div className="relative inline-block w-full max-w-[140px]">
                    <select
                      value={
                        user.roles?.[0]?.key ||
                        (user.role === "admin" ? "ADMIN" : "USER")
                      }
                      onChange={(e) => onRoleChange(user, e.target.value)}
                      disabled={isUpdatingRole || user.id === currentUserId}
                      className={`appearance-none block w-full pl-3 pr-8 py-1.5 text-xs font-semibold rounded-lg border focus:outline-none transition-all duration-200 ${
                        user.id === currentUserId
                          ? "bg-gray-50 text-gray-500 border-gray-200 cursor-not-allowed opacity-75"
                          : user.roles?.[0]?.key === "ADMIN" ||
                              user.role === "admin"
                            ? "bg-green-50 text-green-700 border-green-200 hover:border-green-300 cursor-pointer focus:ring-2 focus:ring-green-500/20"
                            : "bg-blue-50 text-blue-700 border-blue-200 hover:border-blue-300 cursor-pointer focus:ring-2 focus:ring-blue-500/20"
                      }`}
                      style={{ backgroundImage: "none" }}
                    >
                      {rolesData.length > 0 ? (
                        rolesData.map((r) => (
                          <option key={r.id} value={r.key}>
                            {r.name}
                          </option>
                        ))
                      ) : (
                        <>
                          <option value="ADMIN">Administrador</option>
                          <option value="USER">Usuario</option>
                        </>
                      )}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-current opacity-40">
                      <ChevronDown size={14} />
                    </div>
                  </div>
                )}
              </div>
              <div className="xl:col-span-2 text-sm text-gray-500">
                {formatLocalDate(user.createdAt)}
              </div>
              <div className="xl:col-span-1 flex justify-end gap-1">
                <Link
                  to={`/users/${user.id}`}
                  className="p-2 rounded-md text-blue-500 hover:text-blue-700 hover:bg-blue-50 active:scale-95 transition-all duration-200"
                  title="Editar usuario"
                >
                  <Pencil size={18} />
                </Link>
                <button
                  onClick={() => onDeleteClick(user)}
                  disabled={user.id === currentUserId}
                  className={`p-2 rounded-md transition-all duration-200 ${
                    user.id === currentUserId
                      ? "text-gray-300 cursor-not-allowed"
                      : "text-red-500 hover:text-red-700 hover:bg-red-50 active:scale-95"
                  }`}
                  title={
                    user.id === currentUserId
                      ? "No puedes eliminarte a ti mismo"
                      : "Eliminar usuario"
                  }
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            {/* Mobile card */}
            <div className="xl:hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  {user.photoURL ? (
                    <img
                      className="h-10 w-10 rounded-full object-cover border border-gray-200"
                      src={user.photoURL}
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 text-lg font-medium border border-gray-200">
                      {user.email?.charAt(0).toUpperCase() || "U"}
                    </div>
                  )}
                  <div className="ml-3">
                    <div className="font-medium text-gray-900">
                      {user.displayName || user.email}
                    </div>
                    <div className="text-sm text-gray-500">{user.email}</div>
                    <div className="text-xs text-gray-400">{user.area?.name || "Sin área"}</div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Link to={`/users/${user.id}`} className="p-2 rounded-md text-blue-500 hover:text-blue-700 hover:bg-blue-50" title="Editar usuario">
                    <Pencil size={18} />
                  </Link>
                  <button
                    onClick={() => onDeleteClick(user)}
                    disabled={user.id === currentUserId}
                    className={`p-2 rounded-md transition-all duration-200 ${user.id === currentUserId ? "text-gray-300 cursor-not-allowed" : "text-red-500 hover:text-red-700 hover:bg-red-50 active:scale-95"}`}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="relative inline-block w-full max-w-[130px]">
                  <select
                    value={
                      user.roles?.[0]?.key ||
                      (user.role === "admin" ? "ADMIN" : "USER")
                    }
                    onChange={(e) => onRoleChange(user, e.target.value)}
                    disabled={isUpdatingRole || user.id === currentUserId}
                    className="appearance-none block w-full pl-3 pr-8 py-1 text-xs font-semibold rounded-lg border border-blue-200 bg-blue-50 text-blue-700 focus:outline-none"
                    style={{ backgroundImage: "none" }}
                  >
                    {rolesData.length > 0 ? (
                      rolesData.map((r) => (
                        <option key={r.id} value={r.key}>
                          {r.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="ADMIN">Administrador</option>
                        <option value="USER">Usuario</option>
                      </>
                    )}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-current opacity-40">
                    <ChevronDown size={14} />
                  </div>
                </div>
                <div className="text-xs text-gray-400 bg-gray-50 border border-gray-100 px-2 py-1 rounded-md ml-2">
                  {formatLocalDate(user.createdAt)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

// ─── Componente: tabla de invitaciones ────────────────────────
const InvitationsTable = ({
  invitations,
  onDeleteClick,
}: {
  invitations: UserInvitation[];
  onDeleteClick: (inv: UserInvitation) => void;
}) => (
  <div className="bg-white shadow rounded-lg overflow-hidden border border-gray-100">
    {invitations.length === 0 ? (
      <div className="p-8 text-center text-gray-400 italic">
        No hay invitaciones pendientes
      </div>
    ) : (
      <div className="divide-y divide-gray-200">
        {/* Header */}
        <div className="hidden xl:grid xl:grid-cols-12 bg-gray-50 px-6 py-3 rounded-t-lg">
          <div className="xl:col-span-4 text-xs font-medium text-gray-500 uppercase tracking-wider">
            Usuario invitado
          </div>
          <div className="xl:col-span-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
            Área
          </div>
          <div className="xl:col-span-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
            Rol asignado
          </div>
          <div className="xl:col-span-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
            Fecha de invitación
          </div>
          <div className="xl:col-span-1 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
            Acciones
          </div>
        </div>

        {invitations.map((inv, index) => (
          <div
            key={inv.email}
            className={`p-4 xl:p-0 hover:bg-amber-50/40 transition-colors duration-150 ${index === invitations.length - 1 ? "rounded-b-lg" : ""}`}
          >
            {/* Desktop row */}
            <div className="hidden xl:grid xl:grid-cols-12 xl:items-center xl:px-6 xl:py-4">
              <div className="xl:col-span-4">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 border border-amber-200">
                    <Mail size={16} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-800">
                      {[
                        inv.firstName,
                        inv.middleName,
                        inv.paternalSurname,
                        inv.maternalSurname,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </div>
                    <div className="text-xs text-gray-500">{inv.email}</div>
                  </div>
                </div>
              </div>
              <div className="xl:col-span-2 text-sm text-gray-600">
                {inv.area?.name || "Sin área"}
              </div>
              <div className="xl:col-span-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  {inv.roleName}
                </span>
              </div>
              <div className="xl:col-span-3 text-sm text-gray-500">
                {formatLocalDate(inv.createdAt)}
              </div>
              <div className="xl:col-span-1 text-right">
                <button
                  onClick={() => onDeleteClick(inv)}
                  className="p-2 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 active:scale-95 transition-all duration-200"
                  title="Revocar invitación"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>

            {/* Mobile card */}
            <div className="xl:hidden">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 border border-amber-200">
                    <Mail size={18} />
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 text-sm">
                      {[
                        inv.firstName,
                        inv.middleName,
                        inv.paternalSurname,
                        inv.maternalSurname,
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    </div>
                    <div className="text-xs text-gray-500">{inv.email}</div>
                    <div className="text-xs text-gray-400">{inv.area?.name || "Sin área"}</div>
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 mt-0.5">
                      {inv.roleName}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => onDeleteClick(inv)}
                  className="p-2 rounded-md text-red-500 hover:text-red-700 hover:bg-red-50 active:scale-95 transition-all duration-200"
                >
                  <Trash2 size={18} />
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-400 bg-gray-50 border border-gray-100 px-2 py-1 rounded-md inline-block">
                {formatLocalDate(inv.createdAt)}
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

// ─── Página principal ─────────────────────────────────────────
const Users = () => {
  const {
    users,
    isLoading,
    isError,
    pagination,
    setPage,
    setLimit,
    invitations,
    isLoadingInvitations,
    isErrorInvitations,
    invitationsPagination,
    setInvitationsPage,
    setInvitationsLimit,
    deleteUser,
    isDeleting,
    rolesQuery,
    updateUserRole,
    isUpdatingRole,
  } = useUsers();

  const { user: currentUser } = useAuth();
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [invitationToDelete, setInvitationToDelete] =
    useState<UserInvitation | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // ─── Handlers ─────────────────────────────────────────────
  const handleDeleteUserClick = (user: User) => {
    if (user.id === currentUser?.id) {
      toast.error("No puedes eliminar tu propia cuenta");
      return;
    }
    setUserToDelete(user);
  };

  const handleDeleteInvitationClick = (inv: UserInvitation) => {
    setInvitationToDelete(inv);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    try {
      await deleteUser(userToDelete.id);
      toast.success("Usuario eliminado correctamente");
      setUserToDelete(null);
    } catch {
      toast.error("Error al eliminar el usuario");
    }
  };

  const confirmDeleteInvitation = async () => {
    if (!invitationToDelete) return;
    try {
      await deleteUser(invitationToDelete.email);
      toast.success("Invitación revocada correctamente");
      setInvitationToDelete(null);
    } catch {
      toast.error("Error al revocar la invitación");
    }
  };

  const handleRoleChange = async (user: User, newRoleKey: string) => {
    if (!user.id) return;
    if (user.id === currentUser?.id) {
      toast.error("No puedes cambiar tu propio rol");
      return;
    }
    setUpdatingId(user.id);
    try {
      await updateUserRole({ id: user.id, roleKey: newRoleKey });
      toast.success(`Rol de ${user.displayName || user.email} actualizado`);
    } catch {
      toast.error("Error al actualizar el rol");
    } finally {
      setUpdatingId(null);
    }
  };

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="w-full max-w-full mx-auto">
      {/* Cabecera */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
          Gestión de Usuarios
        </h1>
        <Link
          to="/users/new"
          className="btn btn-primary inline-flex items-center shadow-sm hover:shadow-md transition-all duration-200"
        >
          <Plus size={18} className="mr-1 md:mr-2" />
          <span className="hidden sm:inline">Nuevo Usuario</span>
          <span className="sm:hidden">Nuevo</span>
        </Link>
      </div>

      {/* ── Sección: usuarios registrados ─────────────── */}
      <section className="mb-10">
        <h2 className="text-lg font-medium text-gray-700 mb-4 px-1">
          Usuarios Activos
        </h2>
        {isLoading ? (
          <div className="flex justify-center items-center h-40">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-primary" />
          </div>
        ) : isError ? (
          <div
            className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg"
            role="alert"
          >
            <strong className="font-bold">Error: </strong>
            No se pudieron cargar los usuarios.
          </div>
        ) : (
          <>
            <Pagination
              pagination={pagination}
              onPageChange={setPage}
              onLimitChange={setLimit}
              bottom={false}
            />
            <UsersTable
              users={users}
              currentUserId={currentUser?.id}
              rolesData={rolesQuery.data}
              isUpdatingRole={isUpdatingRole}
              updatingId={updatingId}
              onDeleteClick={handleDeleteUserClick}
              onRoleChange={handleRoleChange}
            />
            <Pagination
              pagination={pagination}
              onPageChange={setPage}
              onLimitChange={setLimit}
            />
          </>
        )}
      </section>

      {/* ── Sección: invitaciones pendientes ──────────── */}
      <section className="mb-10">
        <h2 className="text-lg font-medium text-gray-700 mb-4 px-1">
          Invitaciones Pendientes
        </h2>
        {isLoadingInvitations ? (
          <div className="flex justify-center items-center h-40">
            <div className="h-10 w-10 animate-spin rounded-full border-b-2 border-t-2 border-primary" />
          </div>
        ) : isErrorInvitations ? (
          <div
            className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg"
            role="alert"
          >
            <strong className="font-bold">Error: </strong>
            No se pudieron cargar las invitaciones.
          </div>
        ) : (
          <>
            <Pagination
              pagination={invitationsPagination}
              onPageChange={setInvitationsPage}
              onLimitChange={setInvitationsLimit}
              bottom={false}
            />
            <InvitationsTable
              invitations={invitations}
              onDeleteClick={handleDeleteInvitationClick}
            />
            <Pagination
              pagination={invitationsPagination}
              onPageChange={setInvitationsPage}
              onLimitChange={setInvitationsLimit}
            />
          </>
        )}
      </section>

      {/* Modales de confirmación */}
      <ConfirmModal
        isOpen={!!userToDelete}
        onClose={() => setUserToDelete(null)}
        onConfirm={confirmDeleteUser}
        title="Eliminar usuario"
        message={`¿Estás seguro de que deseas eliminar a ${userToDelete?.displayName || userToDelete?.email}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        isDanger={true}
        isLoading={isDeleting}
      />
      <ConfirmModal
        isOpen={!!invitationToDelete}
        onClose={() => setInvitationToDelete(null)}
        onConfirm={confirmDeleteInvitation}
        title="Revocar invitación"
        message={`¿Estás seguro de que deseas revocar la invitación enviada a ${invitationToDelete?.email}?`}
        confirmLabel="Revocar"
        isDanger={true}
        isLoading={isDeleting}
      />
    </div>
  );
};

export default Users;
