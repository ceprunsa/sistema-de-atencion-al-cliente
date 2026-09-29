// ─── Tipos de roles ───────────────────────────────────────────
export interface Role {
  id: string;
  key: string;
  name: string;
}

export interface Area {
  id: string;
  name: string;
}

// ─── Usuario registrado (devuelto por GET /users) ─────────────
export interface UserProfile {
  id: string;
  email: string;
  accountName: string | null;
  firstName: string;
  middleName: string | null;
  paternalSurname: string;
  maternalSurname: string;
  phone: string | null;
  additionalEmail: string | null;
  areaId: string | null;
  area: Area | null;
  photoURL: string;
  status: string;
  roles: Role[];
  createdAt?: string;
  createdBy?: string;
}

// ─── Invitación pendiente (devuelta por GET /user-invitations) ─
export interface UserInvitation {
  email: string;
  firstName: string;
  middleName: string | null;
  paternalSurname: string;
  maternalSurname: string;
  phone: string | null;
  additionalEmail: string | null;
  areaId: string | null;
  area: Area | null;
  roleName: string;
  status: string; // "INVITED"
  createdAt: string;
}

// ─── Tipo legacy User (compatibilidad con UserForm y otras vistas)
export interface User {
  id: string;
  email: string;
  displayName: string;
  accountName?: string | null;
  photoURL?: string | null;
  role: "admin" | "user"; // valor derivado del primer rol
  firstName?: string;
  middleName?: string | null;
  paternalSurname?: string;
  maternalSurname?: string;
  phone?: string | null;
  additionalEmail?: string | null;
  areaId?: string | null;
  area?: Area | null;
  status?: string;
  roles?: Role[];
  createdAt?: string;
  createdBy?: string;
}

// ─── Respuesta paginada genérica ─────────────────────────────
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Estado de paginación ─────────────────────────────────────
export interface PaginationState {
  page: number;
  limit: number;
  totalPages: number;
  total: number;
}

// ─── Tipo de retorno del hook useUsers ───────────────────────
export interface UsersHookReturn {
  // Usuarios registrados
  users: User[];
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  pagination: PaginationState;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;

  // Invitaciones pendientes
  invitations: UserInvitation[];
  isLoadingInvitations: boolean;
  isErrorInvitations: boolean;
  invitationsPagination: PaginationState;
  setInvitationsPage: (page: number) => void;
  setInvitationsLimit: (limit: number) => void;

  // Consulta de usuario individual
  userByIdQuery: {
    data: User | null | undefined;
    isLoading: boolean;
    isError: boolean;
  };

  // Roles disponibles
  rolesQuery: {
    data: Role[];
    isLoading: boolean;
  };

  // Mutaciones
  saveUser: (userData: Partial<User>) => Promise<Partial<User>>;
  updateUserRole: (params: { id: string; roleKey: string }) => Promise<UserProfile>;
  deleteUser: (identifier: string) => Promise<string>;
  isSaving: boolean;
  isUpdatingRole: boolean;
  isDeleting: boolean;
}
