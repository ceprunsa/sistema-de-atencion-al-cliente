// ─── Tipos de roles ───────────────────────────────────────────
export interface Role {
  id: string;
  key: string;
  name: string;
}

export interface Area {
  id: string;
  name: string;
  groupEmail: string | null;
  isActive: boolean;
  disabledByName: string | null;
  disabledAt: string | null;
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
export type ServiceChannelCategory = "IN_PERSON" | "PHONE" | "EMAIL";
export type AttentionCreationOrigin = "WEB" | "GMAIL_CHROME_EXTENSION";

export interface EmailAttachmentMetadata {
  name: string;
  sizeLabel?: string | null;
  typeLabel?: string | null;
}

export interface EmailAttentionDuplicate {
  id: string;
  racCode: string;
  createdAt: string;
  matchType:
    | "MESSAGE_KEY"
    | "FINGERPRINT"
    | "EXCHANGE"
    | "MESSAGE_PAIR"
    | "RECEIVED_MESSAGE"
    | "RESPONSE_MESSAGE";
}
export type AdmissionProcessPhase =
  | "CEPRUNSA_I"
  | "CEPRUNSA_QUINTOS"
  | "CEPRUNSA_II"
  | "EXTRAORDINARIO"
  | "CUSTOM";

export interface AdmissionProcess {
  id: string;
  phase: AdmissionProcessPhase;
  customLabel: string | null;
  year: number;
  isActive: boolean;
}
export type AttentionRegistrationBlockReason =
  | "NO_SESSION"
  | "INACTIVE_PROFILE"
  | "TABLET_SESSION"
  | "NO_ACTIVE_WORKSTATION"
  | "PENDING_SURVEY";

export interface AttentionRegistrationState {
  allowed: boolean;
  reason: AttentionRegistrationBlockReason | null;
  workstationId: string | null;
  workstationName: string | null;
}

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
  dni: string | null;
  displayName: string;
  firstName: string | null;
  middleName: string | null;
  paternalSurname: string | null;
  maternalSurname: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClientListItem extends Client {
  attentionCount: number;
}

export interface ClientAdminDetail extends Client {
  createdById: string | null;
  attentionCount: number;
}

export interface ClientInput {
  dni: string;
  displayName: string;
  firstName: string;
  middleName: string;
  paternalSurname: string;
  maternalSurname: string;
  email: string;
  phone: string;
}

export interface ComplaintAttentionMatch {
  attentionId: string;
  racCode: string;
  attentionCreatedAt: string;
  client: Client;
}

export interface ComplaintAreaOption {
  id: string;
  name: string;
  groupEmail: string;
}

export interface NewComplaintCatalogs {
  serviceChannels: ServiceChannel[];
  responsibleAreas: ComplaintAreaOption[];
  closureArea: ComplaintAreaOption | null;
  canCreate: boolean;
}

export interface CreateComplaintInput {
  requestId: string;
  client: {
    id?: string | null;
    dni: string;
    firstName: string;
    middleName?: string | null;
    paternalSurname: string;
    maternalSurname: string;
    email: string;
    phone?: string | null;
  };
  attentionId?: string | null;
  serviceChannelId: string;
  responsibleAreaId: string;
  description: string;
}

export interface CreatedComplaint {
  id: string;
  complaintCode: string;
  notificationQueued: boolean;
  reusedRequest: boolean;
}

export type ComplaintStatus =
  | "PENDING_MANAGEMENT"
  | "IN_MANAGEMENT"
  | "WAITING_CLIENT_RESPONSE"
  | "RETURNED_BY_CLIENT"
  | "PENDING_CLOSURE_REVIEW"
  | "RETURNED_BY_CLOSURE"
  | "PENDING_SAC_EVALUATION"
  | "CLOSED_AGREED"
  | "CLOSED_NO_RESPONSE";

export type ComplaintListScope =
  | "ALL"
  | "CREATED_BY_ME"
  | "RESPONSIBLE_AREA"
  | "CLOSURE_AREA";

export interface ComplaintListItem {
  id: string;
  complaintCode: string;
  status: ComplaintStatus;
  descriptionPreview: string;
  clientId: string;
  clientDni: string;
  clientName: string;
  clientEmail: string;
  attentionId: string | null;
  racCode: string | null;
  serviceChannelName: string;
  responsibleAreaId: string;
  responsibleAreaName: string;
  closureAreaId: string;
  closureAreaName: string;
  createdById: string | null;
  createdByName: string;
  createdAt: string;
  isCreator: boolean;
  canManageResponsible: boolean;
  canManageClosure: boolean;
}

export interface ComplaintActionVersion {
  id: string;
  versionNumber: number;
  proceeds: boolean;
  analysis: string;
  actions: string;
  clientExplanation: string | null;
  recordedByName: string;
  recordedAt: string;
}

export interface ComplaintClientResponse {
  id: string;
  actionVersionId: string;
  versionNumber: number;
  status: string;
  sentAt: string | null;
  expiresAt: string | null;
  respondedAt: string | null;
  disagreementReason: string | null;
}

export interface ComplaintManagementInput {
  proceeds: boolean;
  analysis: string;
  actions: string;
  clientExplanation: string | null;
}

export interface ComplaintManagementResult {
  status: ComplaintStatus;
  versionNumber: number;
  actionVersionId: string;
  notificationQueued: boolean;
}

export interface PublicComplaintResponseState {
  state: "OPEN" | "INVALID" | "EXPIRED" | "CLOSED" | "PENDING_DELIVERY";
  complaintCode?: string;
  description?: string;
  versionNumber?: number;
  proceeds?: boolean;
  analysis?: string;
  actions?: string;
  clientExplanation?: string | null;
  expiresAt?: string;
}

export interface PublicComplaintResponseResult {
  result: "AGREED" | "DISAGREED" | "INVALID" | "EXPIRED" | "CLOSED" | "INVALID_RESPONSE";
}

export interface ComplaintClosureReview {
  id: string;
  reviewNumber: number;
  isAdequate: boolean;
  observations: string;
  reviewedByName: string;
  reviewedAt: string;
}

export interface ComplaintClosureReviewInput {
  isAdequate: boolean;
  observations: string;
}

export interface ComplaintClosureReviewResult {
  status: ComplaintStatus;
  reviewNumber: number;
  followUpOnly: boolean;
  notificationQueued?: boolean;
}

export interface ComplaintSacDecisionInput {
  shouldCreateSac: boolean;
  comments: string;
}

export interface ComplaintSacDecisionResult {
  status: ComplaintStatus;
  shouldCreateSac: boolean;
  sacId: string | null;
  sacCode: string | null;
  followUpOnly: boolean;
}

export interface ComplaintCommunication {
  id: string;
  type: string;
  recipientEmail: string;
  createdAt: string;
  deliveryStatus: string | null;
  acceptedAt: string | null;
  attemptCount: number | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

export interface ComplaintEvent {
  id: number;
  type: string;
  previousStatus: string | null;
  newStatus: string | null;
  actorName: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface ComplaintDetail {
  id: string;
  complaintCode: string;
  status: ComplaintStatus;
  description: string;
  createdById: string | null;
  createdByName: string;
  createdByEmail: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  currentActionVersion: number;
  client: {
    id: string;
    dni: string;
    displayName: string;
    firstName: string;
    middleName: string | null;
    paternalSurname: string;
    maternalSurname: string;
    email: string;
    phone: string | null;
  };
  linkedAttention: {
    id: string;
    racCode: string;
    status: string;
    createdAt: string;
  } | null;
  serviceChannel: {
    id: string;
    name: string;
    detail: string;
    category: ServiceChannelCategory | null;
  };
  responsibleArea: ComplaintAreaOption & { isActive: boolean };
  closureArea: ComplaintAreaOption & { isActive: boolean };
  permissions: {
    isAdmin: boolean;
    isCreator: boolean;
    canManageResponsible: boolean;
    canManageClosure: boolean;
  };
  actionVersions: ComplaintActionVersion[];
  clientResponses: ComplaintClientResponse[];
  closureReviews: ComplaintClosureReview[];
  sacDecision: {
    id: string;
    shouldCreateSac: boolean;
    comments: string;
    decidedByName: string;
    decidedAt: string;
  } | null;
  sac: {
    id: string;
    sacCode: string;
    createdByName: string;
    createdAt: string;
  } | null;
  communications: ComplaintCommunication[];
  events: ComplaintEvent[];
}

export interface ClientAttentionListItem {
  id: string;
  racCode: string;
  status: CustomerAttentionStatus;
  requesterType: AttentionRequesterType;
  serviceChannelName: string;
  createdByName: string;
  createdAt: string;
  referralStatus: ReferralStatus;
  referralAreaName: string | null;
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
  category: ServiceChannelCategory | null;
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
  creationOrigin: AttentionCreationOrigin;
  emailReceivedAt: string | null;
  emailRespondedAt: string | null;
  emailOriginalText: string | null;
  emailAttachments: EmailAttachmentMetadata[];
  sourceMessageKeyHash: string | null;
  sourceFingerprint: string | null;
  gmailImportVersion: number | null;
  emailResponseOriginalText: string | null;
  emailResponseMailboxEmail: string | null;
  emailResponseMailboxName: string | null;
  emailResponseDelegateEmail: string | null;
  emailResponseIsDelegated: boolean;
  emailReceivedAtSource: string | null;
  emailRespondedAtSource: string | null;
  gmailConversationUrl: string | null;
  sourceResponseMessageKeyHash: string | null;
  sourceExchangeFingerprint: string | null;
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
    id?: string | null;
    createNew?: boolean;
    dni?: string | null;
    displayName: string;
    firstName?: string | null;
    middleName?: string | null;
    paternalSurname?: string | null;
    maternalSurname?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  serviceChannelId: string;
  requesterType: AttentionRequesterType;
  kinshipTypeId?: string | null;
  requesterDetail?: string | null;
  kinshipDetail?: string | null;
  conclusion: string;
  creationOrigin?: AttentionCreationOrigin;
  emailReceivedAt?: string | null;
  emailRespondedAt?: string | null;
  emailOriginalText?: string | null;
  emailAttachments?: EmailAttachmentMetadata[];
  sourceMessageKeyHash?: string | null;
  sourceFingerprint?: string | null;
  gmailImportVersion?: number | null;
  emailResponseOriginalText?: string | null;
  emailResponseMailboxEmail?: string | null;
  emailResponseMailboxName?: string | null;
  emailResponseDelegateEmail?: string | null;
  emailResponseIsDelegated?: boolean;
  emailReceivedAtSource?: string | null;
  emailRespondedAtSource?: string | null;
  gmailConversationUrl?: string | null;
  sourceResponseMessageKeyHash?: string | null;
  sourceExchangeFingerprint?: string | null;
  topics: AttentionTopicSelection[];
  destinationAreaId?: string | null;
  admissionProcessIds: string[];
}

export interface NewAttentionCatalogs {
  serviceChannels: ServiceChannel[];
  consultationTypes: ConsultationType[];
  consultationTopics: ConsultationTopic[];
  kinshipTypes: KinshipType[];
  areas: Area[];
  admissionProcesses: AdmissionProcess[];
}

export interface CreatedCustomerAttention {
  id: string;
  racCode: string;
}

export interface UpdateCustomerAttentionInput {
  id: string;
  client: {
    dni?: string | null;
    displayName: string;
    firstName?: string | null;
    middleName?: string | null;
    paternalSurname?: string | null;
    maternalSurname?: string | null;
    email?: string | null;
    phone?: string | null;
  };
  serviceChannelId: string;
  requesterType: AttentionRequesterType;
  kinshipTypeId?: string | null;
  requesterDetail?: string | null;
  kinshipDetail?: string | null;
  conclusion: string;
  emailReceivedAt?: string | null;
  emailRespondedAt?: string | null;
  topics: AttentionTopicSelection[];
  destinationAreaId?: string | null;
  admissionProcessIds: string[];
}

export interface AttentionListItem {
  id: string;
  racCode: string;
  status: CustomerAttentionStatus;
  requesterType: AttentionRequesterType;
  clientDni: string | null;
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
  admissionProcesses: AdmissionProcess[];
}

export interface ReferralInboxItem {
  id: string;
  attentionId: string;
  racCode: string;
  clientDni: string | null;
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

export interface DashboardBreakdownItem {
  key: string;
  label: string;
  count: number;
  category?: string | null;
}

export interface DashboardSurveySummary {
  kind: "ATTENTION" | "REFERRAL";
  completed: number;
  skipped: number;
  pending: number;
  cancelled: number;
}

export interface DashboardStatistics {
  scope: "GLOBAL" | "OWN";
  dateFrom: string;
  dateTo: string;
  activeAttentionsOnly: boolean;
  totalAttentions: number;
  referrals: { total: number; pending: number; resolved: number };
  satisfaction: {
    validResponses: number;
    score: number | null;
    responses: DashboardBreakdownItem[];
  };
  byChannel: DashboardBreakdownItem[];
  byWorkstation: DashboardBreakdownItem[];
  byAdmissionProcess: DashboardBreakdownItem[];
  surveys: DashboardSurveySummary[];
  trendGranularity: "DAY" | "MONTH";
  attentionTrend: DashboardBreakdownItem[];
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
