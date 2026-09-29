import { supabase } from "../supabase/config";
import type {
  Area,
  PaginatedResponse,
  Role,
  UserInvitation,
  UserProfile,
} from "../types";

type ProfileRow = {
  id: string;
  area_id: string | null;
  account_name: string | null;
  first_name: string;
  middle_name: string | null;
  paternal_surname: string;
  maternal_surname: string;
  phone: string | null;
  additional_email: string | null;
  email: string | null;
  photo_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type ProfileWithRoles = ProfileRow & {
  user_roles?: Array<{ role: Role | null }> | null;
  area?: Area | null;
};

type InvitationRow = {
  email: string;
  area_id: string | null;
  first_name: string;
  middle_name: string | null;
  paternal_surname: string;
  maternal_surname: string;
  phone: string | null;
  additional_email: string | null;
  role_name: string;
  created_at: string;
  area?: Area | null;
};

type AuthUserData = {
  id: string;
  email: string;
  accountName?: string | null;
  photoURL?: string | null;
};

const DEFAULT_ROLES: Role[] = [
  { id: "admin", key: "ADMIN", name: "Administrador" },
  { id: "user", key: "USER", name: "Usuario" },
];

const normalizeRoleKey = (roleKey: string) =>
  roleKey.toUpperCase() === "ADMIN" ? "ADMIN" : "USER";

const mapProfileRow = (row: ProfileWithRoles): UserProfile => {
  const roles =
    row.user_roles?.map((userRole) => userRole.role).filter(Boolean) || [];

  return {
    id: row.id,
    email: row.email || "",
    accountName: row.account_name,
    firstName: row.first_name,
    middleName: row.middle_name,
    paternalSurname: row.paternal_surname,
    maternalSurname: row.maternal_surname,
    phone: row.phone,
    additionalEmail: row.additional_email,
    areaId: row.area_id,
    area: row.area || null,
    photoURL: row.photo_url || "",
    status: row.status,
    roles: roles as Role[],
    createdAt: row.created_at,
  };
};

const mapInvitationRow = (row: InvitationRow): UserInvitation => ({
  email: row.email,
  firstName: row.first_name,
  middleName: row.middle_name,
  paternalSurname: row.paternal_surname,
  maternalSurname: row.maternal_surname,
  phone: row.phone,
  additionalEmail: row.additional_email,
  areaId: row.area_id,
  area: row.area || null,
  roleName: row.role_name,
  status: "INVITED",
  createdAt: row.created_at,
});

const paginate = <T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResponse<T> => ({
  data,
  total,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

const getFunctionErrorMessage = async (error: unknown) => {
  const response = (error as { context?: Response })?.context;

  if (response instanceof Response) {
    try {
      const body = (await response.clone().json()) as { error?: string };
      if (body.error) return body.error;
    } catch {
      // Se usará el mensaje estándar del cliente.
    }
  }

  return error instanceof Error
    ? error.message
    : "No se pudo completar la operación.";
};

const getRoleByKey = async (roleKey: string): Promise<Role> => {
  const normalizedRoleKey = normalizeRoleKey(roleKey);
  const { data, error } = await supabase
    .from("roles")
    .select("*")
    .eq("key", normalizedRoleKey)
    .single();

  if (error) throw error;
  if (!data) {
    throw new Error(`No existe el rol ${normalizedRoleKey} en Supabase.`);
  }

  return data;
};

const setUserRole = async (userId: string, roleKey: string) => {
  const role = await getRoleByKey(roleKey);

  const { error: deleteError } = await supabase
    .from("user_roles")
    .delete()
    .eq("user_id", userId);

  if (deleteError) throw deleteError;

  const { error: insertError } = await supabase.from("user_roles").insert({
    user_id: userId,
    role_id: role.id,
  });

  if (insertError) throw insertError;
};

const acceptInvitation = async (currentUser: AuthUserData) => {
  const { error } = await supabase.rpc("accept_user_invitation", {
    p_account_name: currentUser.accountName || null,
    p_photo_url: currentUser.photoURL || null,
  });

  if (error) throw error;
};

const getProfileById = async (id: string): Promise<UserProfile | null> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*, area:areas(id,name), user_roles(role:roles(id,key,name))")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapProfileRow(data as ProfileWithRoles) : null;
};

const ensureActiveProfileWithRole = (profile: UserProfile) => {
  if (profile.status.toLowerCase() !== "active") {
    throw new Error("Tu cuenta esta inactiva. Contacta a un administrador.");
  }

  if (!profile.roles?.length) {
    throw new Error("Tu cuenta no tiene un rol asignado.");
  }
};

export const usersApi = {
  /**
   * Obtiene o crea el perfil del usuario autenticado directamente en Supabase.
   * Si tenia una invitacion pendiente, aplica su rol y elimina la invitacion.
   */
  getProfile: async (authUser?: AuthUserData): Promise<UserProfile> => {
    let user = null;

    if (!authUser) {
      const {
        data: { user: authUserData },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError) throw authError;
      user = authUserData;
    }

    const currentUser = authUser || {
      id: user?.id || "",
      email: user?.email || "",
      accountName:
        (user?.user_metadata?.full_name as string | undefined) ||
        (user?.user_metadata?.name as string | undefined) ||
        null,
      photoURL: (user?.user_metadata?.avatar_url as string | undefined) || null,
    };

    if (!currentUser.id || !currentUser.email) {
      throw new Error("No hay un usuario autenticado en Supabase.");
    }

    const { data: invitation, error: invitationError } = await supabase
      .from("user_invitations")
      .select("*")
      .eq("email", currentUser.email.trim().toLowerCase())
      .maybeSingle();

    if (invitationError) throw invitationError;

    if (invitation) {
      try {
        await acceptInvitation(currentUser);
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        const profileAfterRace = await getProfileById(currentUser.id);

        if (
          message.includes("No existe una invitacion activa") &&
          profileAfterRace
        ) {
          ensureActiveProfileWithRole(profileAfterRace);
          return profileAfterRace;
        }

        throw error;
      }

      const refreshedProfile = await getProfileById(currentUser.id);
      if (!refreshedProfile) {
        throw new Error("No se pudo cargar el perfil del usuario.");
      }

      ensureActiveProfileWithRole(refreshedProfile);
      return refreshedProfile;
    }

    const existingProfile = await getProfileById(currentUser.id);

    if (!existingProfile) {
      throw new Error("No tienes una invitación activa para ingresar.");
    }

    ensureActiveProfileWithRole(existingProfile);

    const { error: updateProfileError } = await supabase
      .from("profiles")
      .update({
        account_name:
          existingProfile.accountName || currentUser.accountName || null,
        photo_url: currentUser.photoURL || existingProfile.photoURL || null,
        status: existingProfile.status,
      })
      .eq("id", currentUser.id);

    if (updateProfileError) throw updateProfileError;

    const refreshedProfile = await getProfileById(currentUser.id);
    if (!refreshedProfile) {
      throw new Error("No se pudo cargar el perfil del usuario.");
    }

    ensureActiveProfileWithRole(refreshedProfile);

    return refreshedProfile;
  },

  /**
   * Lista perfiles registrados con sus roles.
   */
  listUsers: async (
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedResponse<UserProfile>> => {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from("profiles")
      .select("*, area:areas(id,name), user_roles(role:roles(id,key,name))", { count: "exact" })
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    return paginate(
      ((data || []) as ProfileWithRoles[]).map(mapProfileRow),
      count || 0,
      page,
      limit,
    );
  },

  /**
   * Lista invitaciones pendientes.
   */
  listInvitations: async (
    page: number = 1,
    limit: number = 10,
  ): Promise<PaginatedResponse<UserInvitation>> => {
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, error, count } = await supabase
      .from("user_invitations")
      .select("*, area:areas(id,name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;

    return paginate(
      ((data || []) as InvitationRow[]).map(mapInvitationRow),
      count || 0,
      page,
      limit,
    );
  },

  /**
   * Crea o actualiza una invitacion pendiente.
   */
  inviteUser: async (
    values: Omit<
      UserProfile,
      | "id"
      | "accountName"
      | "photoURL"
      | "status"
      | "roles"
      | "area"
      | "createdAt"
      | "createdBy"
    >,
    roleKey: string,
  ): Promise<UserProfile> => {
    const normalizedRoleKey = normalizeRoleKey(roleKey);
    const role = await getRoleByKey(normalizedRoleKey);

    const { error } = await supabase.from("user_invitations").upsert(
      {
        email: values.email.trim().toLowerCase(),
        first_name: values.firstName.trim(),
        middle_name: values.middleName?.trim() || null,
        paternal_surname: values.paternalSurname.trim(),
        maternal_surname: values.maternalSurname.trim(),
        phone: values.phone?.trim() || null,
        additional_email: values.additionalEmail?.trim().toLowerCase() || null,
        area_id: values.areaId || null,
        role_name: role.name,
      },
      { onConflict: "email" },
    );

    if (error) throw error;

    return {
      id: values.email,
      accountName: null,
      ...values,
      area: null,
      photoURL: "",
      status: "INVITED",
      roles: DEFAULT_ROLES.filter((role) => role.key === normalizedRoleKey),
    };
  },

  /**
   * Actualiza datos editables de un perfil y su rol principal.
   */
  updateUser: async (
    id: string,
    values: {
      email: string;
      accountName?: string | null;
      firstName: string;
      middleName?: string | null;
      paternalSurname: string;
      maternalSurname: string;
      phone?: string | null;
      additionalEmail?: string | null;
      areaId?: string | null;
      roleKey?: string;
    },
  ): Promise<UserProfile> => {
    const { error } = await supabase
      .from("profiles")
      .update({
        email: values.email.trim().toLowerCase(),
        account_name: values.accountName?.trim() || null,
        first_name: values.firstName.trim(),
        middle_name: values.middleName?.trim() || null,
        paternal_surname: values.paternalSurname.trim(),
        maternal_surname: values.maternalSurname.trim(),
        phone: values.phone?.trim() || null,
        additional_email: values.additionalEmail?.trim().toLowerCase() || null,
        area_id: values.areaId || null,
      })
      .eq("id", id);

    if (error) throw error;

    if (values.roleKey) {
      await setUserRole(id, values.roleKey);
    }

    const profile = await getProfileById(id);
    if (!profile) throw new Error("Usuario no encontrado.");

    return profile;
  },

  /**
   * Cambia el rol principal de un perfil.
   */
  updateRole: async (id: string, roleKey: string): Promise<UserProfile> => {
    await setUserRole(id, roleKey);

    const profile = await getProfileById(id);
    if (!profile) throw new Error("Usuario no encontrado.");

    return profile;
  },

  /** Revoca una invitación o elimina físicamente un usuario mediante Edge Function. */
  deleteUser: async (identifier: string): Promise<{ success: boolean }> => {
    const isInvitation = identifier.includes("@");

    if (isInvitation) {
      const { error } = await supabase
        .from("user_invitations")
        .delete()
        .eq("email", identifier.trim().toLowerCase());

      if (error) throw error;
      return { success: true };
    }

    const { data, error } = await supabase.functions.invoke("delete-user", {
      body: { userId: identifier },
    });

    if (error) {
      throw new Error(await getFunctionErrorMessage(error));
    }

    if (!data?.success) {
      throw new Error(data?.error || "Supabase no confirmó la eliminación.");
    }

    return { success: true };
  },

  /**
   * Roles disponibles desde la tabla roles.
   */
  listRoles: async (): Promise<Role[]> => {
    const { data, error } = await supabase
      .from("roles")
      .select("*")
      .order("name", { ascending: true });

    if (error) throw error;
    return data?.length ? data : DEFAULT_ROLES;
  },
};
