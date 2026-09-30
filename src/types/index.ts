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

export type AttentionRequesterType = "APPLICANT" | "RELATIVE";
export type CustomerAttentionStatus = "ACTIVE" | "DISABLED";

export interface Client {
  id: string;
  dni: string;
  firstName: string;
  middleName: string | null;
  paternalSurname: string;
  maternalSurname: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceChannel {
  id: string;
  name: string;
  detail: string;
  isActive: boolean;
  disabledByName: string | null;
  disabledAt: string | null;
}

export interface ConsultationType {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
}

export interface ConsultationTopic {
  id: string;
  consultationTypeId: string;
  name: string;
  displayOrder: number;
  requiresAbsenceCount: boolean;
  isActive: boolean;
}

export interface KinshipType {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
}

export interface AttentionTopicSelection {
  topicId: string;
  absenceCount: number | null;
}

export interface AttentionReferral {
  id: string;
  attentionId: string;
  destinationAreaId: string | null;
  destinationAreaName: string;
  referredByName: string;
  referredAt: string;
  conclusion: string | null;
  concludedByName: string | null;
  concludedAt: string | null;
}

export interface CustomerAttention {
  id: string;
  racYear: number;
  racNumber: number;
  racCode: string;
  clientId: string;
  serviceChannelId: string;
  requesterType: AttentionRequesterType;
  kinshipTypeId: string | null;
  conclusion: string;
  status: CustomerAttentionStatus;
  createdByName: string;
  createdByEmail: string;
  createdAt: string;
  updatedByName: string | null;
  updatedAt: string;
  disabledReason: string | null;
  disabledByName: string | null;
  disabledAt: string | null;
}

export interface CreateCustomerAttentionInput {
  client: {
    dni: string;
    firstName?: string;
    middleName?: string | null;
    paternalSurname?: string;
    maternalSurname?: string;
    email?: string | null;
    phone?: string | null;
  };
  serviceChannelId: string;
  requesterType: AttentionRequesterType;
  kinshipTypeId?: string | null;
  conclusion: string;
  topics: AttentionTopicSelection[];
  destinationAreaId?: string | null;
}

export interface NewAttentionCatalogs {
  serviceChannels: ServiceChannel[];
  consultationTypes: ConsultationType[];
  consultationTopics: ConsultationTopic[];
  kinshipTypes: KinshipType[];
  areas: Area[];
}

export interface CreatedCustomerAttention {
  id: string;
  racCode: string;
}

export interface UpdateCustomerAttentionInput {
  id: string;
  client: {
    firstName: string;
    middleName?: string | null;
    paternalSurname: string;
    maternalSurname: string;
    email?: string | null;
    phone?: string | null;
  };
  serviceChannelId: string;
  requesterType: AttentionRequesterType;
  kinshipTypeId?: string | null;
  conclusion: string;
  topics: AttentionTopicSelection[];
  destinationAreaId?: string | null;
}

export interface AttentionListItem {
  id: string;
  racCode: string;
  status: CustomerAttentionStatus;
  requesterType: AttentionRequesterType;
  clientDni: string;
  clientName: string;
  serviceChannelName: string;
  createdByName: string;
  createdAt: string;
}

export interface AttentionTopicDetail {
  id: string;
  name: string;
  consultationTypeName: string;
  absenceCount: number | null;
}

export interface CustomerAttentionDetail extends CustomerAttention {
  client: Client;
  serviceChannel: ServiceChannel;
  kinshipName: string | null;
  topics: AttentionTopicDetail[];
  referral: AttentionReferral | null;
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
