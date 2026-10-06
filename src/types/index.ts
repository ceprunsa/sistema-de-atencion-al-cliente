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

export type AttentionRequesterType = "APPLICANT" | "RELATIVE" | "OTHER";
export type CustomerAttentionStatus = "ACTIVE" | "DISABLED";
export type SurveyStatus =
  | "NONE"
  | "PENDING_DECISION"
  | "QUEUED"
  | "SENT"
  | "COMPLETED"
  | "SKIPPED"
  | "CANCELLED";
export type SurveyResponse =
  | "VERY_SATISFIED"
  | "SATISFIED"
  | "DISSATISFIED"
  | "VERY_DISSATISFIED";
export type SurveyChannel = "UNDECIDED" | "TABLET" | "EMAIL";
export type ReferralStatus = "NONE" | "PENDING" | "RESOLVED" | "DISABLED" | "CANCELLED";

export interface Workstation {
  id: string;
  name: string;
  isActive: boolean;
  assignedUserId: string | null;
  assignedUserName: string | null;
  tabletBindingId: string | null;
  tabletLastSeenAt: string | null;
}

export interface TabletBinding {
  id: string;
  workstationId: string;
  workstationName: string;
  activatedAt: string;
}

export interface TabletSurvey {
  id: string;
  status: "SENT";
  sentAt: string;
}

export interface AttentionSurvey {
  id: string;
  status: SurveyStatus;
  channel: SurveyChannel;
  response: SurveyResponse | null;
  recipientEmail: string | null;
  expiresAt: string | null;
  sentAt: string | null;
  completedAt: string | null;
  closedReason: string | null;
  closedAt: string | null;
}

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

export type ClientLookupResult =
  | { source: "LOCAL"; client: Client }
  | {
      source: "EXTERNAL";
      person: {
        firstName: string;
        middleName: string | null;
        paternalSurname: string;
        maternalSurname: string;
      };
    }
  | { source: "MANUAL"; message: string };

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
  sourceAreaId: string | null;
  sourceAreaName: string | null;
  status: Exclude<ReferralStatus, "NONE">;
  disabledReason: string | null;
  disabledByName: string | null;
  disabledAt: string | null;
  cancelledReason: string | null;
  cancelledByName: string | null;
  cancelledAt: string | null;
  survey: ReferralSurvey | null;
}

export interface ReferralSurvey {
  id: string;
  status: Exclude<SurveyStatus, "NONE" | "PENDING_DECISION">;
  response: SurveyResponse | null;
  recipientEmail: string | null;
  expiresAt: string | null;
  sentAt: string | null;
  completedAt: string | null;
  closedReason: string | null;
  closedAt: string | null;
}

export interface ConcludeReferralResult {
  referralStatus: "RESOLVED";
  surveyStatus: ReferralSurvey["status"];
  emailQueued: boolean;
  recipientEmail?: string;
  message: string;
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
  requesterDetail: string | null;
  kinshipDetail: string | null;
  conclusion: string;
  status: CustomerAttentionStatus;
  createdById: string | null;
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
  requesterDetail?: string | null;
  kinshipDetail?: string | null;
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
  requesterDetail?: string | null;
  kinshipDetail?: string | null;
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
  surveyStatus: SurveyStatus;
  referralStatus: ReferralStatus;
  referralAreaId: string | null;
  referralAreaName: string | null;
}

export interface AttentionTopicDetail {
  id: string;
  name: string;
  consultationTypeName: string;
}

export interface CustomerAttentionDetail extends CustomerAttention {
  client: Client;
  serviceChannel: ServiceChannel;
  kinshipName: string | null;
  topics: AttentionTopicDetail[];
  referral: AttentionReferral | null;
  survey: AttentionSurvey | null;
}

export interface ReferralInboxItem {
  id: string;
  attentionId: string;
  racCode: string;
  clientDni: string;
  clientName: string;
  destinationAreaId: string;
  destinationAreaName: string;
  referredByName: string;
  referredAt: string;
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
