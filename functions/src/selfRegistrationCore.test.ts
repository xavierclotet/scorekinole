import { describe, it, expect } from "vitest";
import {
  applyRegister,
  applyUnregister,
  applyLeaveWaitlist,
  sanitizePartnerInput,
  sanitizeTeamNameInput,
  toMillisMaybe,
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
