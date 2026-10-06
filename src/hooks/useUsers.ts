"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { usersApi } from "../api/users";
import { useAuthStore } from "../store/authStore";
import type {
  PaginationState,
  User,
  UserProfile,
  UsersHookReturn,
} from "../types";
import toast from "react-hot-toast";

const DEFAULT_PAGINATION: PaginationState = {
  page: 1,
  limit: 10,
  totalPages: 1,
  total: 0,
};

const mapSupabaseUser = (profile: UserProfile): User => {
  const mainRole = profile.roles?.[0]?.key || "USER";
  const displayName = [
    profile.firstName,
    profile.middleName,
    profile.paternalSurname,
    profile.maternalSurname,
  ].filter(Boolean).join(" ");

  return {
    id: profile.id,
    email: profile.email,
    displayName,
    accountName: profile.accountName,
    photoURL: profile.photoURL,
    role: mainRole.toLowerCase() as "admin" | "user",
    firstName: profile.firstName,
    middleName: profile.middleName,
    paternalSurname: profile.paternalSurname,
    maternalSurname: profile.maternalSurname,
    phone: profile.phone,
    additionalEmail: profile.additionalEmail,
    areaId: profile.areaId,
    area: profile.area,
    status: profile.status,
    roles: profile.roles,
    createdAt: profile.createdAt,
    createdBy: profile.createdBy,
  };
};

const handleMutationError = async (error: unknown) => {
  const message =
    error instanceof Error ? error.message : "Error inesperado. Intenta nuevamente.";

  if (message.toLowerCase().includes("jwt")) {
    toast.error("Sesion expirada. Inicia sesion nuevamente.");
    await useAuthStore.getState().logout();
    return;
  }

  toast.error(message);
};

export const useUsers = (userId?: string): UsersHookReturn => {
  const queryClient = useQueryClient();
  const { createUser, user: authenticatedUser, _setUser } = useAuthStore();

  const [usersPage, setUsersPage] = useState(1);
  const [usersLimit, setUsersLimit] = useState(10);
  const [invitationsPage, setInvitationsPage] = useState(1);
  const [invitationsLimit, setInvitationsLimit] = useState(10);

  const usersQuery = useQuery({
    queryKey: ["users", usersPage, usersLimit],
    queryFn: () => usersApi.listUsers(usersPage, usersLimit),
  });

  const invitationsQuery = useQuery({
    queryKey: ["user-invitations", invitationsPage, invitationsLimit],
    queryFn: () =>
      usersApi.listInvitations(invitationsPage, invitationsLimit),
  });

  const userByIdQuery = useQuery({
    queryKey: ["users", "byId", userId],
    queryFn: async () => {
      if (!userId) return null;

      const response = await usersApi.listUsers(1, 1000);
      const profile = response.data.find((u) => u.id === userId);

      return profile ? mapSupabaseUser(profile) : null;
    },
    enabled: !!userId,
  });

  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: () => usersApi.listRoles(),
  });

  const saveUser = async (userData: Partial<User>): Promise<Partial<User>> => {
    if (!userData.email) {
      throw new Error("El correo electronico es requerido");
    }
    if (!userData.firstName?.trim() || !userData.paternalSurname?.trim() || !userData.maternalSurname?.trim()) {
      throw new Error("El primer nombre y ambos apellidos son requeridos");
    }
    if (userData.id) {
      const updatedProfile = await usersApi.updateUser(userData.id, {
        email: userData.email,
        accountName: userData.accountName,
        firstName: userData.firstName,
        middleName: userData.middleName,
        paternalSurname: userData.paternalSurname,
        maternalSurname: userData.maternalSurname,
        phone: userData.phone,
        additionalEmail: userData.additionalEmail,
        areaId: userData.areaId || null,
        roleKey: userData.role === "admin" ? "ADMIN" : "USER",
      });
      const updatedUser = mapSupabaseUser(updatedProfile);
      if (authenticatedUser?.id === updatedUser.id) _setUser(updatedUser);
      return updatedUser;
    }

    await createUser(userData);
    return userData;
  };

  const deleteUser = async (identifier: string): Promise<string> => {
    await usersApi.deleteUser(identifier);
    return identifier;
  };

  const updateUserRole = async ({
    id,
    roleKey,
  }: {
    id: string;
    roleKey: string;
  }): Promise<UserProfile> => {
    return usersApi.updateRole(id, roleKey);
  };

  const saveUserMutation = useMutation({
    mutationFn: saveUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["user-invitations"] });
    },
    onError: handleMutationError,
  });

  const updateRoleMutation = useMutation({
    mutationFn: updateUserRole,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
    onError: handleMutationError,
  });

  const deleteUserMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      queryClient.invalidateQueries({ queryKey: ["user-invitations"] });
    },
    onError: handleMutationError,
  });

  const usersPagination: PaginationState = usersQuery.data
    ? {
        page: usersQuery.data.page,
        limit: usersQuery.data.limit,
        totalPages: usersQuery.data.totalPages,
        total: usersQuery.data.total,
      }
    : { ...DEFAULT_PAGINATION, limit: usersLimit };

  const invitationsPagination: PaginationState = invitationsQuery.data
    ? {
        page: invitationsQuery.data.page,
        limit: invitationsQuery.data.limit,
        totalPages: invitationsQuery.data.totalPages,
        total: invitationsQuery.data.total,
      }
    : { ...DEFAULT_PAGINATION, limit: invitationsLimit };

  const handleSetPage = (page: number) => setUsersPage(page);
  const handleSetLimit = (limit: number) => {
    setUsersLimit(limit);
    setUsersPage(1);
  };
  const handleSetInvitationsPage = (page: number) =>
    setInvitationsPage(page);
  const handleSetInvitationsLimit = (limit: number) => {
    setInvitationsLimit(limit);
    setInvitationsPage(1);
  };

  return {
    users: (usersQuery.data?.data || []).map(mapSupabaseUser),
    isLoading: usersQuery.isLoading,
    isError: usersQuery.isError,
    error: usersQuery.error as Error | null,
    pagination: usersPagination,
    setPage: handleSetPage,
    setLimit: handleSetLimit,

    invitations: invitationsQuery.data?.data || [],
    isLoadingInvitations: invitationsQuery.isLoading,
    isErrorInvitations: invitationsQuery.isError,
    invitationsPagination,
    setInvitationsPage: handleSetInvitationsPage,
    setInvitationsLimit: handleSetInvitationsLimit,

    userByIdQuery: {
      data: userByIdQuery.data,
      isLoading: userByIdQuery.isLoading,
      isError: userByIdQuery.isError,
    },

    rolesQuery: {
      data: rolesQuery.data || [],
      isLoading: rolesQuery.isLoading,
    },

    saveUser: saveUserMutation.mutateAsync,
    updateUserRole: updateRoleMutation.mutateAsync,
    deleteUser: deleteUserMutation.mutateAsync,
    isSaving: saveUserMutation.isPending,
    isUpdatingRole: updateRoleMutation.isPending,
    isDeleting: deleteUserMutation.isPending,
  };
};
