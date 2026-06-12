/**
 * Pure logic for the tournamentSelfRegistration callable.
 *
 * Server-side mirror of the self-service registration logic in
 * src/lib/firebase/tournamentRegistration.ts (validateRegistration,
 * determineRegistrationOutcome, shouldAutoPromote, sanitizePromotedPartner,
 * detachUserFromPartnerSlots). Keep both in sync when registration rules
 * change — the client copy drives the UI, this copy is the enforcement point.
 *
 * No Firebase dependencies — fully testable.
 */

export type ParticipantType = "REGISTERED" | "GUEST";

export interface PartnerData {
  type: ParticipantType;
  userId?: string;
  name: string;
}

export interface SelfParticipant {
  id?: string;
  type?: string;
  userId?: string;
  userKey?: string;
  name?: string;
  email?: string;
  photoURL?: string;
  rankingSnapshot?: number;
  status?: string;
  partner?: PartnerData;
  teamName?: string;
  [key: string]: unknown;
}

export interface SelfWaitlistEntry {
  userId: string;
  userName?: string;
  userKey?: string;
  registeredAt?: number;
  email?: string;
  photoURL?: string;
  partner?: PartnerData;
  teamName?: string;
  [key: string]: unknown;
}

export interface RegistrationConfig {
  enabled?: boolean;
  deadline?: number;
  maxParticipants?: number;
  allowWaitlist?: boolean;
}

/** Caller identity + profile snapshot used to build the new participant row. */
export interface SelfUserInfo {
  uid: string;
  name: string;
  userKey: string;
  email?: string;
  photoURL?: string;
}

// ---------------------------------------------------------------------------
// Parsing helpers (raw Firestore document → typed values)
// ---------------------------------------------------------------------------

/** Firestore Timestamp or epoch-ms number → epoch ms (undefined when absent). */
export function toMillisMaybe(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { toMillis?: unknown }).toMillis === "function"
  ) {
    return (value as { toMillis(): number }).toMillis();
  }
  return undefined;
}

function listOf<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function parseRegistrationConfig(value: unknown): RegistrationConfig | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  return {
    enabled: raw.enabled === true,
    deadline: toMillisMaybe(raw.deadline),
    maxParticipants: typeof raw.maxParticipants === "number" ? raw.maxParticipants : undefined,
    allowWaitlist: typeof raw.allowWaitlist === "boolean" ? raw.allowWaitlist : undefined,
  };
}

// ---------------------------------------------------------------------------
// Input sanitization (untrusted callable payload)
// ---------------------------------------------------------------------------

const MAX_NAME_LENGTH = 100;
const MAX_USER_ID_LENGTH = 200;

/**
 * Validate the partner payload sent by the client. Returns a clean PartnerData
 * (only the three known fields) or undefined when no partner was sent.
 * Throws Error('Invalid partner data') on malformed input.
 */
export function sanitizePartnerInput(value: unknown): PartnerData | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object") throw new Error("Invalid partner data");
  const raw = value as Record<string, unknown>;
  const type = raw.type;
  if (type !== "REGISTERED" && type !== "GUEST") throw new Error("Invalid partner data");
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name || name.length > MAX_NAME_LENGTH) throw new Error("Invalid partner data");
  if (type === "REGISTERED") {
    const userId = raw.userId;
    if (typeof userId !== "string" || !userId || userId.length > MAX_USER_ID_LENGTH) {
      throw new Error("Invalid partner data");
    }
    return { type, userId, name };
  }
  return { type, name };
}

/** Validate the optional teamName payload. Throws Error('Invalid team name') on bad input. */
export function sanitizeTeamNameInput(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error("Invalid team name");
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_NAME_LENGTH) throw new Error("Invalid team name");
  return trimmed;
}

// ---------------------------------------------------------------------------
// Pure helpers (mirrored from src/lib/firebase/tournamentRegistration.ts)
// ---------------------------------------------------------------------------

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isWaitlistAllowed(allowWaitlist: boolean | undefined): boolean {
  return allowWaitlist !== false;
}

export function normalizeGuestPartnerName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function collectGuestPartnerNames(
  participants: SelfParticipant[],
  waitlist: SelfWaitlistEntry[]
): string[] {
  const names: string[] = [];
  for (const p of participants) {
    if (p.partner?.type === "GUEST" && p.partner.name) names.push(normalizeGuestPartnerName(p.partner.name));
  }
  for (const w of waitlist) {
    if (w.partner?.type === "GUEST" && w.partner.name) names.push(normalizeGuestPartnerName(w.partner.name));
  }
  return names;
}

export function countActiveParticipants(participants: Array<{ status?: string }>): number {
  let count = 0;
  for (const p of participants) {
    if (!p.status || p.status === "ACTIVE") count++;
  }
  return count;
}

export function collectPartnerUserIds(
  participants: SelfParticipant[],
  waitlist: SelfWaitlistEntry[]
): string[] {
  const ids: string[] = [];
  for (const p of participants) {
    if (p.partner?.userId) ids.push(p.partner.userId);
  }
  for (const w of waitlist) {
    if (w.partner?.userId) ids.push(w.partner.userId);
  }
  return ids;
}

export interface RegistrationValidation {
  canRegister: boolean;
  reason?:
    | "not_draft"
    | "registration_disabled"
    | "deadline_passed"
    | "tournament_full"
    | "already_registered"
    | "already_waitlisted"
    | "self_as_partner"
    | "partner_already_registered"
    | "partner_on_waitlist"
    | "guest_partner_name_taken";
}

export function validateRegistration(
  tournamentStatus: string,
  registration: RegistrationConfig | undefined,
  participantUserIds: string[],
  waitlistUserIds: string[],
  currentUserId: string,
  now: number,
  partnerUserIds: string[] = [],
  partnerUserId?: string,
  tournamentDate?: number,
  existingGuestPartnerNames: string[] = [],
  proposedGuestPartnerName?: string,
  participantsCount?: number
): RegistrationValidation {
  if (tournamentStatus !== "DRAFT") return { canRegister: false, reason: "not_draft" };
  if (!registration?.enabled) return { canRegister: false, reason: "registration_disabled" };
  if (registration.deadline && now > registration.deadline) return { canRegister: false, reason: "deadline_passed" };
  if (tournamentDate !== undefined && now >= tournamentDate) return { canRegister: false, reason: "deadline_passed" };
  const occupiedSlots = participantsCount ?? participantUserIds.length;
  if (!isWaitlistAllowed(registration.allowWaitlist) && registration.maxParticipants && occupiedSlots >= registration.maxParticipants) {
    return { canRegister: false, reason: "tournament_full" };
  }
  if (participantUserIds.includes(currentUserId)) return { canRegister: false, reason: "already_registered" };
  if (partnerUserIds.includes(currentUserId)) return { canRegister: false, reason: "already_registered" };
  if (waitlistUserIds.includes(currentUserId)) return { canRegister: false, reason: "already_waitlisted" };
  if (partnerUserId) {
    if (partnerUserId === currentUserId) return { canRegister: false, reason: "self_as_partner" };
    if (participantUserIds.includes(partnerUserId)) return { canRegister: false, reason: "partner_already_registered" };
    if (partnerUserIds.includes(partnerUserId)) return { canRegister: false, reason: "partner_already_registered" };
    if (waitlistUserIds.includes(partnerUserId)) return { canRegister: false, reason: "partner_on_waitlist" };
  }
  if (proposedGuestPartnerName !== undefined && proposedGuestPartnerName.trim() !== "") {
    const normalized = normalizeGuestPartnerName(proposedGuestPartnerName);
    if (existingGuestPartnerNames.includes(normalized)) {
      return { canRegister: false, reason: "guest_partner_name_taken" };
    }
  }
  return { canRegister: true };
}

export function determineRegistrationOutcome(
  participantsCount: number,
  maxParticipants?: number,
  allowWaitlist?: boolean
): "registered" | "waitlisted" {
  if (maxParticipants && participantsCount >= maxParticipants && isWaitlistAllowed(allowWaitlist)) return "waitlisted";
  return "registered";
}

export function shouldAutoPromote(
  waitlist: SelfWaitlistEntry[],
  registration: RegistrationConfig | undefined,
  newParticipantCount: number
): boolean {
  if (waitlist.length === 0) return false;
  if (registration && !registration.enabled) return false;
  if (registration?.maxParticipants && newParticipantCount >= registration.maxParticipants) return false;
  return true;
}

export function sanitizePromotedPartner(
  partner: PartnerData | undefined,
  currentParticipants: SelfParticipant[],
  currentWaitlist: SelfWaitlistEntry[],
  promotedUserId: string
): PartnerData | undefined {
  if (!partner) return undefined;
  if (partner.type !== "REGISTERED" || !partner.userId) return partner;
  if (partner.userId === promotedUserId) return undefined;
  const primaryIds = new Set(
    currentParticipants.map((p) => p.userId).filter((id): id is string => !!id)
  );
  if (primaryIds.has(partner.userId)) return undefined;
  const partnerSlots = new Set(collectPartnerUserIds(currentParticipants, currentWaitlist));
  if (partnerSlots.has(partner.userId)) return undefined;
  const waitlistPrimaryIds = new Set(currentWaitlist.map((w) => w.userId));
  if (waitlistPrimaryIds.has(partner.userId)) return undefined;
  return partner;
}

export function detachUserFromPartnerSlots(
  participants: SelfParticipant[],
  waitlist: SelfWaitlistEntry[],
  userId: string
): { participants: SelfParticipant[]; waitlist: SelfWaitlistEntry[]; detached: boolean } {
  let detached = false;
  const newParticipants = participants.map((p) => {
    if (p.partner?.userId === userId) {
      detached = true;
      const { partner, ...rest } = p;
      void partner;
      return rest as SelfParticipant;
    }
    return p;
  });
  const newWaitlist = waitlist.map((w) => {
    if (w.partner?.userId === userId) {
      detached = true;
      const { partner, ...rest } = w;
      void partner;
      return rest as SelfWaitlistEntry;
    }
    return w;
  });
  return { participants: newParticipants, waitlist: newWaitlist, detached };
}

// ---------------------------------------------------------------------------
// Action appliers — take the raw tournament doc data and return the update
// to write (inside the caller's transaction). Throw Error with the exact
// message strings the client UI already maps to i18n keys.
// ---------------------------------------------------------------------------

export interface TournamentDocLike {
  status?: unknown;
  registration?: unknown;
  participants?: unknown;
  waitlist?: unknown;
  tournamentDate?: unknown;
}

export interface RegisterApplyResult {
  outcome: "registered" | "waitlisted";
  update: { participants: SelfParticipant[] } | { waitlist: SelfWaitlistEntry[] };
}

export function applyRegister(
  data: TournamentDocLike,
  user: SelfUserInfo,
  partner: PartnerData | undefined,
  teamName: string | undefined,
  now: number,
  participantId: string
): RegisterApplyResult {
  const participants = listOf<SelfParticipant>(data.participants);
  const waitlist = listOf<SelfWaitlistEntry>(data.waitlist);
  const status = typeof data.status === "string" ? data.status : "";
  const registration = parseRegistrationConfig(data.registration);

  const participantUserIds = participants
    .filter((p) => p.userId)
    .map((p) => p.userId!);
  const waitlistUserIds = waitlist.map((w) => w.userId);
  const partnerUserIds = collectPartnerUserIds(participants, waitlist);
  const guestPartnerNames = collectGuestPartnerNames(participants, waitlist);
  const activeParticipantsCount = countActiveParticipants(participants);

  const validation = validateRegistration(
    status,
    registration,
    participantUserIds,
    waitlistUserIds,
    user.uid,
    now,
    partnerUserIds,
    partner?.type === "REGISTERED" ? partner.userId : undefined,
    toMillisMaybe(data.tournamentDate),
    guestPartnerNames,
    partner?.type === "GUEST" ? partner.name : undefined,
    activeParticipantsCount
  );
  if (!validation.canRegister) {
    throw new Error(validation.reason || "Cannot register");
  }

  const outcome = determineRegistrationOutcome(
    activeParticipantsCount,
    registration?.maxParticipants,
    registration?.allowWaitlist
  );

  if (outcome === "registered") {
    const participant: SelfParticipant = {
      id: participantId,
      type: "REGISTERED",
      userId: user.uid,
      userKey: user.userKey,
      name: user.name,
      rankingSnapshot: 0,
      status: "ACTIVE",
      ...(user.email ? { email: normalizeEmail(user.email) } : {}),
      ...(user.photoURL ? { photoURL: user.photoURL } : {}),
      ...(partner ? { partner } : {}),
      ...(teamName ? { teamName } : {}),
    };
    return { outcome, update: { participants: [...participants, participant] } };
  }

  const entry: SelfWaitlistEntry = {
    userId: user.uid,
    userName: user.name,
    userKey: user.userKey,
    registeredAt: now,
    ...(user.email ? { email: normalizeEmail(user.email) } : {}),
    ...(user.photoURL ? { photoURL: user.photoURL } : {}),
    ...(partner ? { partner } : {}),
  };
  return { outcome, update: { waitlist: [...waitlist, entry] } };
}

export interface UnregisterApplyResult {
  promoted: boolean;
  update: { participants: SelfParticipant[]; waitlist: SelfWaitlistEntry[] };
}

export function applyUnregister(
  data: TournamentDocLike,
  uid: string,
  now: number,
  promotedParticipantId: string
): UnregisterApplyResult {
  const participants = listOf<SelfParticipant>(data.participants);
  const waitlist = listOf<SelfWaitlistEntry>(data.waitlist);
  const status = typeof data.status === "string" ? data.status : "";
  const registration = parseRegistrationConfig(data.registration);

  if (status !== "DRAFT") throw new Error("Cannot unregister after tournament has started");

  const participantIndex = participants.findIndex((p) => p.userId === uid);

  // Case B: user is not a primary participant but occupies a partner slot
  // (REGISTERED partner of someone else's team). Detach without removing the team.
  if (participantIndex === -1) {
    const detach = detachUserFromPartnerSlots(participants, waitlist, uid);
    if (!detach.detached) throw new Error("Not registered");
    return {
      promoted: false,
      update: { participants: detach.participants, waitlist: detach.waitlist },
    };
  }

  const newParticipants = participants.filter((p) => p.userId !== uid);
  let newWaitlist = waitlist;
  let promoted = false;

  if (shouldAutoPromote(waitlist, registration, newParticipants.length)) {
    const next = waitlist[0];
    const remainingWaitlist = waitlist.slice(1);
    const safePartner = sanitizePromotedPartner(next.partner, newParticipants, remainingWaitlist, next.userId);
    const promotedParticipant: SelfParticipant = {
      id: promotedParticipantId,
      type: "REGISTERED",
      userId: next.userId,
      userKey: next.userKey ?? "",
      name: next.userName ?? "Jugador",
      rankingSnapshot: 0,
      status: "ACTIVE",
      ...(next.email ? { email: next.email } : {}),
      ...(next.photoURL ? { photoURL: next.photoURL } : {}),
      ...(safePartner ? { partner: safePartner } : {}),
      ...(next.teamName ? { teamName: next.teamName } : {}),
    };
    newParticipants.push(promotedParticipant);
    newWaitlist = remainingWaitlist;
    promoted = true;
  }

  return { promoted, update: { participants: newParticipants, waitlist: newWaitlist } };
}

export interface LeaveWaitlistApplyResult {
  update: { waitlist: SelfWaitlistEntry[] };
}

export function applyLeaveWaitlist(
  data: TournamentDocLike,
  uid: string
): LeaveWaitlistApplyResult {
  const waitlist = listOf<SelfWaitlistEntry>(data.waitlist);
  const status = typeof data.status === "string" ? data.status : "";

  if (status !== "DRAFT") throw new Error("Cannot leave waitlist after tournament has started");
  if (!waitlist.some((w) => w.userId === uid)) throw new Error("Not on waitlist");

  return { update: { waitlist: waitlist.filter((w) => w.userId !== uid) } };
}
