import { describe, it, expect } from "vitest";
import {
  applyRegister,
  applyUnregister,
  applyLeaveWaitlist,
  sanitizePartnerInput,
  sanitizeTeamNameInput,
  toMillisMaybe,
  parseRegistrationConfig,
  type SelfUserInfo,
  type TournamentDocLike,
} from "./selfRegistrationCore";

const NOW = 1_750_000_000_000;

const alice: SelfUserInfo = {
  uid: "alice-uid",
  name: "Alice",
  userKey: "AAAAAA",
  email: "Alice@Example.com",
  photoURL: "https://example.com/alice.jpg",
};

function draftTournament(overrides: Partial<TournamentDocLike> = {}): TournamentDocLike {
  return {
    status: "DRAFT",
    registration: { enabled: true },
    participants: [],
    waitlist: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Input sanitization
// ---------------------------------------------------------------------------

describe("sanitizePartnerInput", () => {
  it("returns undefined for absent partner", () => {
    expect(sanitizePartnerInput(undefined)).toBeUndefined();
    expect(sanitizePartnerInput(null)).toBeUndefined();
  });

  it("accepts a REGISTERED partner and strips unknown fields", () => {
    const partner = sanitizePartnerInput({
      type: "REGISTERED",
      userId: "bob-uid",
      name: "Bob",
      isAdmin: true,
    });
    expect(partner).toEqual({ type: "REGISTERED", userId: "bob-uid", name: "Bob" });
  });

  it("accepts a GUEST partner without userId", () => {
    expect(sanitizePartnerInput({ type: "GUEST", name: "Guest Gal" })).toEqual({
      type: "GUEST",
      name: "Guest Gal",
    });
  });

  it("rejects unknown partner types", () => {
    expect(() => sanitizePartnerInput({ type: "ADMIN", name: "X" })).toThrow("Invalid partner data");
  });

  it("rejects REGISTERED partner without userId", () => {
    expect(() => sanitizePartnerInput({ type: "REGISTERED", name: "Bob" })).toThrow("Invalid partner data");
  });

  it("rejects empty or oversized names", () => {
    expect(() => sanitizePartnerInput({ type: "GUEST", name: "   " })).toThrow("Invalid partner data");
    expect(() => sanitizePartnerInput({ type: "GUEST", name: "x".repeat(101) })).toThrow("Invalid partner data");
  });

  it("rejects non-object payloads", () => {
    expect(() => sanitizePartnerInput("REGISTERED")).toThrow("Invalid partner data");
  });
});

describe("sanitizeTeamNameInput", () => {
  it("returns undefined for absent or empty team name", () => {
    expect(sanitizeTeamNameInput(undefined)).toBeUndefined();
    expect(sanitizeTeamNameInput("   ")).toBeUndefined();
  });

  it("trims valid team names", () => {
    expect(sanitizeTeamNameInput("  Los Cracks ")).toBe("Los Cracks");
  });

  it("rejects non-string and oversized values", () => {
    expect(() => sanitizeTeamNameInput(42)).toThrow("Invalid team name");
    expect(() => sanitizeTeamNameInput("x".repeat(101))).toThrow("Invalid team name");
  });
});

describe("toMillisMaybe", () => {
  it("passes through finite numbers", () => {
    expect(toMillisMaybe(123)).toBe(123);
  });

  it("converts Timestamp-like objects", () => {
    expect(toMillisMaybe({ toMillis: () => 456 })).toBe(456);
  });

  it("returns undefined otherwise", () => {
    expect(toMillisMaybe(undefined)).toBeUndefined();
    expect(toMillisMaybe("2026-01-01")).toBeUndefined();
    expect(toMillisMaybe(NaN)).toBeUndefined();
  });
});

describe("parseRegistrationConfig", () => {
  it("returns undefined for non-object input", () => {
    expect(parseRegistrationConfig(null)).toBeUndefined();
    expect(parseRegistrationConfig("nope")).toBeUndefined();
  });

  it("keeps a valid positive maxParticipants", () => {
    expect(parseRegistrationConfig({ enabled: true, maxParticipants: 8 })?.maxParticipants).toBe(8);
  });

  // Hardening: a stored negative max is truthy and would waitlist/block EVERYONE.
  it("treats a negative maxParticipants as no limit (undefined)", () => {
    expect(parseRegistrationConfig({ enabled: true, maxParticipants: -3 })?.maxParticipants).toBeUndefined();
  });

  it("treats 0 maxParticipants as no limit (undefined)", () => {
    expect(parseRegistrationConfig({ enabled: true, maxParticipants: 0 })?.maxParticipants).toBeUndefined();
  });

  it("treats a NaN maxParticipants as no limit (undefined)", () => {
    expect(parseRegistrationConfig({ enabled: true, maxParticipants: NaN })?.maxParticipants).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// applyRegister
// ---------------------------------------------------------------------------

describe("applyRegister", () => {
  it("appends the caller as a new participant with normalized email", () => {
    const result = applyRegister(draftTournament(), alice, undefined, undefined, NOW, "p-1");
    expect(result.outcome).toBe("registered");
    const update = result.update as { participants: any[] };
    expect(update.participants).toHaveLength(1);
    expect(update.participants[0]).toMatchObject({
      id: "p-1",
      type: "REGISTERED",
      userId: "alice-uid",
      userKey: "AAAAAA",
      name: "Alice",
      email: "alice@example.com",
      rankingSnapshot: 0,
      status: "ACTIVE",
    });
  });

  it("preserves existing participants", () => {
    const data = draftTournament({ participants: [{ id: "p-0", userId: "bob-uid", name: "Bob" }] });
    const result = applyRegister(data, alice, undefined, undefined, NOW, "p-1");
    const update = result.update as { participants: any[] };
    expect(update.participants).toHaveLength(2);
    expect(update.participants[0].userId).toBe("bob-uid");
  });

  it("includes partner and teamName on the participant", () => {
    const partner = { type: "GUEST" as const, name: "Guest Gal" };
    const result = applyRegister(draftTournament(), alice, partner, "Los Cracks", NOW, "p-1");
    const update = result.update as { participants: any[] };
    expect(update.participants[0].partner).toEqual(partner);
    expect(update.participants[0].teamName).toBe("Los Cracks");
  });

  it("routes to the waitlist when the tournament is full", () => {
    const data = draftTournament({
      registration: { enabled: true, maxParticipants: 1 },
      participants: [{ id: "p-0", userId: "bob-uid", name: "Bob", status: "ACTIVE" }],
    });
    const result = applyRegister(data, alice, undefined, undefined, NOW, "p-1");
    expect(result.outcome).toBe("waitlisted");
    const update = result.update as { waitlist: any[] };
    expect(update.waitlist).toHaveLength(1);
    expect(update.waitlist[0]).toMatchObject({
      userId: "alice-uid",
      userName: "Alice",
      userKey: "AAAAAA",
      registeredAt: NOW,
      email: "alice@example.com",
    });
  });

  it("keeps partner AND teamName on the waitlist entry when routed to the waitlist", () => {
    // Doubles pair signs up while the tournament is full: the entry must retain
    // everything needed to rebuild the participant row at promotion time.
    const data = draftTournament({
      registration: { enabled: true, maxParticipants: 1 },
      participants: [{ id: "p-0", userId: "bob-uid", name: "Bob", status: "ACTIVE" }],
    });
    const partner = { type: "GUEST" as const, name: "Guest Gal" };
    const result = applyRegister(data, alice, partner, "Los Cracks", NOW, "p-1");
    expect(result.outcome).toBe("waitlisted");
    const update = result.update as { waitlist: any[] };
    expect(update.waitlist[0].partner).toEqual(partner);
    expect(update.waitlist[0].teamName).toBe("Los Cracks");
  });

  it("teamName survives the full waitlist round-trip: register (full) → unregister → promotion", () => {
    const data = draftTournament({
      registration: { enabled: true, maxParticipants: 1 },
      participants: [{ id: "p-0", userId: "bob-uid", name: "Bob", status: "ACTIVE" }],
    });
    const partner = { type: "GUEST" as const, name: "Guest Gal" };
    const registered = applyRegister(data, alice, partner, "Los Cracks", NOW, "p-1");
    const waitlisted = draftTournament({
      registration: { enabled: true, maxParticipants: 1 },
      participants: data.participants,
      waitlist: (registered.update as { waitlist: any[] }).waitlist,
    });
    const result = applyUnregister(waitlisted, "bob-uid", NOW, "p-2");
    expect(result.promoted).toBe(true);
    const promoted = result.update.participants.find((p) => p.userId === "alice-uid");
    expect(promoted?.teamName).toBe("Los Cracks");
    expect(promoted?.partner).toEqual(partner);
  });

  it("rejects duplicate registration", () => {
    const data = draftTournament({
      participants: [{ id: "p-0", userId: "alice-uid", name: "Alice" }],
    });
    expect(() => applyRegister(data, alice, undefined, undefined, NOW, "p-1")).toThrow("already_registered");
  });

  it("rejects when the caller already occupies a partner slot", () => {
    const data = draftTournament({
      participants: [
        { id: "p-0", userId: "bob-uid", name: "Bob", partner: { type: "REGISTERED", userId: "alice-uid", name: "Alice" } },
      ],
    });
    expect(() => applyRegister(data, alice, undefined, undefined, NOW, "p-1")).toThrow("already_registered");
  });

  it("rejects when the tournament is not in DRAFT", () => {
    const data = draftTournament({ status: "GROUP_STAGE" });
    expect(() => applyRegister(data, alice, undefined, undefined, NOW, "p-1")).toThrow("not_draft");
  });

  it("rejects when registration is disabled or missing", () => {
    expect(() =>
      applyRegister(draftTournament({ registration: { enabled: false } }), alice, undefined, undefined, NOW, "p-1")
    ).toThrow("registration_disabled");
    expect(() =>
      applyRegister(draftTournament({ registration: undefined }), alice, undefined, undefined, NOW, "p-1")
    ).toThrow("registration_disabled");
  });

  it("rejects after the deadline", () => {
    const data = draftTournament({ registration: { enabled: true, deadline: NOW - 1 } });
    expect(() => applyRegister(data, alice, undefined, undefined, NOW, "p-1")).toThrow("deadline_passed");
  });

  it("rejects when a guest partner name is already taken", () => {
    const data = draftTournament({
      participants: [
        { id: "p-0", userId: "bob-uid", name: "Bob", partner: { type: "GUEST", name: "Guest  Gal" } },
      ],
    });
    expect(() =>
      applyRegister(data, alice, { type: "GUEST", name: "guest gal" }, undefined, NOW, "p-1")
    ).toThrow("guest_partner_name_taken");
  });

  it("rejects full tournament with waitlist disabled", () => {
    const data = draftTournament({
      registration: { enabled: true, maxParticipants: 1, allowWaitlist: false },
      participants: [{ id: "p-0", userId: "bob-uid", name: "Bob", status: "ACTIVE" }],
    });
    expect(() => applyRegister(data, alice, undefined, undefined, NOW, "p-1")).toThrow("tournament_full");
  });

  // --- No participant cap (maxParticipants undefined ⇒ unlimited registration) ---

  it("registers with no maxParticipants even when many are already registered (never full)", () => {
    const participants = Array.from({ length: 50 }, (_, i) => ({
      id: `p-${i}`,
      userId: `u-${i}`,
      name: `Player ${i}`,
      status: "ACTIVE",
    }));
    const data = draftTournament({
      registration: { enabled: true }, // no maxParticipants → unlimited
      participants,
    });
    const result = applyRegister(data, alice, undefined, undefined, NOW, "p-new");
    expect(result.outcome).toBe("registered");
    const update = result.update as { participants: any[] };
    expect(update.participants).toHaveLength(51);
    expect(update.participants.some((p) => p.userId === "alice-uid")).toBe(true);
  });

  it("registers with no maxParticipants even when waitlist is disabled (no cap ⇒ never routes to waitlist or blocks)", () => {
    const participants = Array.from({ length: 30 }, (_, i) => ({
      id: `p-${i}`,
      userId: `u-${i}`,
      name: `Player ${i}`,
      status: "ACTIVE",
    }));
    const data = draftTournament({
      registration: { enabled: true, allowWaitlist: false }, // no max + no waitlist must NOT lock anyone out
      participants,
    });
    const result = applyRegister(data, alice, undefined, undefined, NOW, "p-new");
    expect(result.outcome).toBe("registered");
    const update = result.update as { participants: any[] };
    expect(update.participants).toHaveLength(31);
  });

  it("rejects when the caller is already on the waitlist", () => {
    const data = draftTournament({
      waitlist: [{ userId: "alice-uid", userName: "Alice" }],
    });
    expect(() => applyRegister(data, alice, undefined, undefined, NOW, "p-1")).toThrow("already_waitlisted");
  });

  it("rejects registering with yourself as your own partner", () => {
    const partner = { type: "REGISTERED" as const, userId: "alice-uid", name: "Alice" };
    expect(() => applyRegister(draftTournament(), alice, partner, undefined, NOW, "p-1")).toThrow("self_as_partner");
  });

  it("rejects when the chosen partner is already on the waitlist", () => {
    const data = draftTournament({
      waitlist: [{ userId: "bob-uid", userName: "Bob" }],
    });
    const partner = { type: "REGISTERED" as const, userId: "bob-uid", name: "Bob" };
    expect(() => applyRegister(data, alice, partner, undefined, NOW, "p-1")).toThrow("partner_on_waitlist");
  });

  // Doubles: maxParticipants counts PAIRS (one participant row per team), not players.
  it("routes a doubles team to the waitlist when pair capacity (maxParticipants) is reached", () => {
    const data = draftTournament({
      registration: { enabled: true, maxParticipants: 2 }, // 2 = max PAIRS
      participants: [
        { id: "p-0", userId: "bob-uid", name: "Bob", status: "ACTIVE", partner: { type: "GUEST", name: "B2" } },
        { id: "p-1", userId: "carl-uid", name: "Carl", status: "ACTIVE", partner: { type: "GUEST", name: "C2" } },
      ],
    });
    const partner = { type: "GUEST" as const, name: "A2" };
    const result = applyRegister(data, alice, partner, "Team A", NOW, "p-new");
    expect(result.outcome).toBe("waitlisted");
    const update = result.update as { waitlist: any[] };
    expect(update.waitlist[0]).toMatchObject({ userId: "alice-uid", partner: { type: "GUEST", name: "A2" } });
  });

  // Hardening: a corrupt negative max must NOT silently waitlist every sign-up.
  it("registers normally when maxParticipants is negative (treated as no limit)", () => {
    const data = draftTournament({
      registration: { enabled: true, maxParticipants: -1 },
      participants: [{ id: "p-0", userId: "bob-uid", name: "Bob", status: "ACTIVE" }],
    });
    const result = applyRegister(data, alice, undefined, undefined, NOW, "p-1");
    expect(result.outcome).toBe("registered");
  });
});

// ---------------------------------------------------------------------------
// applyUnregister
// ---------------------------------------------------------------------------

describe("applyUnregister", () => {
  it("removes the caller's own participant row", () => {
    const data = draftTournament({
      participants: [
        { id: "p-0", userId: "alice-uid", name: "Alice" },
        { id: "p-1", userId: "bob-uid", name: "Bob" },
      ],
    });
    const result = applyUnregister(data, "alice-uid", NOW, "p-new");
    expect(result.promoted).toBe(false);
    expect(result.update.participants).toHaveLength(1);
    expect(result.update.participants[0].userId).toBe("bob-uid");
  });

  it("promotes the first waitlist entry (FIFO) into the freed slot", () => {
    const data = draftTournament({
      participants: [{ id: "p-0", userId: "alice-uid", name: "Alice" }],
      waitlist: [
        { userId: "carol-uid", userName: "Carol", userKey: "CCCCCC", registeredAt: 1 },
        { userId: "dave-uid", userName: "Dave", registeredAt: 2 },
      ],
    });
    const result = applyUnregister(data, "alice-uid", NOW, "p-new");
    expect(result.promoted).toBe(true);
    expect(result.update.participants).toHaveLength(1);
    expect(result.update.participants[0]).toMatchObject({
      id: "p-new",
      userId: "carol-uid",
      name: "Carol",
      type: "REGISTERED",
      status: "ACTIVE",
      rankingSnapshot: 0,
    });
    expect(result.update.waitlist).toHaveLength(1);
    expect(result.update.waitlist[0].userId).toBe("dave-uid");
  });

  it("does not promote when registration is disabled", () => {
    const data = draftTournament({
      registration: { enabled: false },
      participants: [{ id: "p-0", userId: "alice-uid", name: "Alice" }],
      waitlist: [{ userId: "carol-uid", userName: "Carol" }],
    });
    const result = applyUnregister(data, "alice-uid", NOW, "p-new");
    expect(result.promoted).toBe(false);
    expect(result.update.participants).toHaveLength(0);
    expect(result.update.waitlist).toHaveLength(1);
  });

  it("detaches the caller from a partner slot without removing the team", () => {
    const data = draftTournament({
      participants: [
        { id: "p-0", userId: "bob-uid", name: "Bob", partner: { type: "REGISTERED", userId: "alice-uid", name: "Alice" } },
      ],
    });
    const result = applyUnregister(data, "alice-uid", NOW, "p-new");
    expect(result.update.participants).toHaveLength(1);
    expect(result.update.participants[0].userId).toBe("bob-uid");
    expect(result.update.participants[0].partner).toBeUndefined();
  });

  it("detaches the caller from a partner slot on a WAITLIST entry (waitlist-partner exit path)", () => {
    // Alice is not a participant nor a waitlist primary — she's the REGISTERED
    // partner inside Bob's waitlist entry. Unregister must clear that slot so
    // she stops being blocked from registering elsewhere in the tournament.
    const data = draftTournament({
      participants: [{ id: "p-0", userId: "carol-uid", name: "Carol" }],
      waitlist: [
        {
          userId: "bob-uid",
          userName: "Bob",
          partner: { type: "REGISTERED", userId: "alice-uid", name: "Alice" },
        },
      ],
    });
    const result = applyUnregister(data, "alice-uid", NOW, "p-new");
    expect(result.promoted).toBe(false);
    expect(result.update.participants).toHaveLength(1);
    expect(result.update.waitlist).toHaveLength(1);
    expect(result.update.waitlist[0].userId).toBe("bob-uid");
    expect(result.update.waitlist[0].partner).toBeUndefined();
  });

  it("rejects when the caller is not registered at all", () => {
    const data = draftTournament({ participants: [{ id: "p-0", userId: "bob-uid", name: "Bob" }] });
    expect(() => applyUnregister(data, "alice-uid", NOW, "p-new")).toThrow("Not registered");
  });

  it("rejects after the tournament has started", () => {
    const data = draftTournament({
      status: "GROUP_STAGE",
      participants: [{ id: "p-0", userId: "alice-uid", name: "Alice" }],
    });
    expect(() => applyUnregister(data, "alice-uid", NOW, "p-new")).toThrow(
      "Cannot unregister after tournament has started"
    );
  });

  // Capacity-aware promotion: the freed slot is filled up to (and not beyond) maxParticipants.
  it("promotes the waitlister into the freed slot, filling exactly up to maxParticipants", () => {
    const data = draftTournament({
      registration: { enabled: true, maxParticipants: 2 },
      participants: [
        { id: "p-0", userId: "alice-uid", name: "Alice", status: "ACTIVE" },
        { id: "p-1", userId: "bob-uid", name: "Bob", status: "ACTIVE" },
      ],
      waitlist: [{ userId: "carol-uid", userName: "Carol", userKey: "CCCCCC", registeredAt: 1 }],
    });
    const result = applyUnregister(data, "alice-uid", NOW, "p-new");
    expect(result.promoted).toBe(true);
    expect(result.update.participants).toHaveLength(2); // back to exactly max, never over
    expect(result.update.participants.some((p) => p.userId === "carol-uid")).toBe(true);
    expect(result.update.waitlist).toHaveLength(0);
  });

  // Integrity: a promoted waitlister's stale REGISTERED partner ref must be dropped
  // when that partner is now a primary participant (otherwise they'd appear twice).
  it("drops a promoted waitlister's partner ref when that partner is already a primary participant", () => {
    const data = draftTournament({
      participants: [
        { id: "p-0", userId: "alice-uid", name: "Alice", status: "ACTIVE" },
        { id: "p-1", userId: "bob-uid", name: "Bob", status: "ACTIVE" },
      ],
      waitlist: [
        {
          userId: "carol-uid",
          userName: "Carol",
          registeredAt: 1,
          partner: { type: "REGISTERED", userId: "bob-uid", name: "Bob" },
        },
      ],
    });
    const result = applyUnregister(data, "alice-uid", NOW, "p-new");
    expect(result.promoted).toBe(true);
    const carol = result.update.participants.find((p) => p.userId === "carol-uid");
    expect(carol?.partner).toBeUndefined();
  });

  // Hardening: capacity for promotion counts ACTIVE rows only. WITHDRAWN rows
  // still occupy array slots but free their registration slot, so they must not
  // block a valid promotion.
  it("counts only ACTIVE participants for promotion capacity (WITHDRAWN rows free their slot)", () => {
    const data = draftTournament({
      registration: { enabled: true, maxParticipants: 2 },
      participants: [
        { id: "p-0", userId: "alice-uid", name: "Alice", status: "ACTIVE" },
        { id: "p-1", userId: "bob-uid", name: "Bob", status: "WITHDRAWN" },
        { id: "p-2", userId: "carl-uid", name: "Carl", status: "WITHDRAWN" },
      ],
      waitlist: [{ userId: "dave-uid", userName: "Dave", registeredAt: 1 }],
    });
    const result = applyUnregister(data, "alice-uid", NOW, "p-new");
    expect(result.promoted).toBe(true);
    expect(result.update.participants.some((p) => p.userId === "dave-uid")).toBe(true);
    expect(result.update.waitlist).toHaveLength(0);
  });

  it("keeps a promoted waitlister's GUEST partner and teamName intact", () => {
    const data = draftTournament({
      participants: [{ id: "p-0", userId: "alice-uid", name: "Alice", status: "ACTIVE" }],
      waitlist: [
        {
          userId: "carol-uid",
          userName: "Carol",
          registeredAt: 1,
          partner: { type: "GUEST", name: "Zoe" },
          teamName: "CZ",
        },
      ],
    });
    const result = applyUnregister(data, "alice-uid", NOW, "p-new");
    const carol = result.update.participants.find((p) => p.userId === "carol-uid");
    expect(carol?.partner).toEqual({ type: "GUEST", name: "Zoe" });
    expect(carol?.teamName).toBe("CZ");
  });
});

// ---------------------------------------------------------------------------
// applyLeaveWaitlist
// ---------------------------------------------------------------------------

describe("applyLeaveWaitlist", () => {
  it("removes only the caller's waitlist entry", () => {
    const data = draftTournament({
      waitlist: [
        { userId: "alice-uid", userName: "Alice" },
        { userId: "bob-uid", userName: "Bob" },
      ],
    });
    const result = applyLeaveWaitlist(data, "alice-uid");
    expect(result.update.waitlist).toHaveLength(1);
    expect(result.update.waitlist[0].userId).toBe("bob-uid");
  });

  it("rejects when the caller is not on the waitlist", () => {
    const data = draftTournament({ waitlist: [{ userId: "bob-uid", userName: "Bob" }] });
    expect(() => applyLeaveWaitlist(data, "alice-uid")).toThrow("Not on waitlist");
  });

  it("rejects after the tournament has started", () => {
    const data = draftTournament({
      status: "GROUP_STAGE",
      waitlist: [{ userId: "alice-uid", userName: "Alice" }],
    });
    expect(() => applyLeaveWaitlist(data, "alice-uid")).toThrow(
      "Cannot leave waitlist after tournament has started"
    );
  });
});
