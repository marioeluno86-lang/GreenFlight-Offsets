import { describe, expect, it, vi, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface MatchRecord {
  projectIds: number[];
  matchedCredits: number;
  timestamp: number;
  matcher: string;
  mode: number;
  metadata: string;
  retired: boolean;
}

interface PendingMatch {
  proposedProjectIds: number[];
  proposedCredits: number;
  proposer: string;
  expiry: number;
}

interface AutoPreference {
  preferredProjects: number[];
  minCreditsPerProject: number;
  maxFee: number;
}

interface ContractState {
  matches: Map<number, MatchRecord>;
  pendingMatches: Map<number, PendingMatch>;
  autoPreferences: Map<string, AutoPreference>;
  matchCounter: number;
  isPaused: boolean;
  matchFee: number;
  autoMatchThreshold: number;
  owner: string;
  // Mocked contract references (simplified as maps or functions)
  flightEmissions: Map<number, number>;
  projectCredits: Map<number, number>;
  verifiedProjects: Set<number>;
  mintedTokens: Map<string, number>;
  retiredTokens: Map<string, number>;
}

// Mock contract implementation
class OffsetMatcherMock {
  private state: ContractState = {
    matches: new Map(),
    pendingMatches: new Map(),
    autoPreferences: new Map(),
    matchCounter: 0,
    isPaused: false,
    matchFee: 100,
    autoMatchThreshold: 1000,
    owner: "deployer",
    flightEmissions: new Map([[1, 5000], [2, 3000]]),
    projectCredits: new Map([[1, 2000], [2, 4000], [3, 1000]]),
    verifiedProjects: new Set([1, 2, 3]),
    mintedTokens: new Map(),
    retiredTokens: new Map(),
  };

  private ERR_UNAUTHORIZED = 100;
  private ERR_INVALID_FLIGHT = 101;
  private ERR_INVALID_PROJECT = 102;
  private ERR_INSUFFICIENT_CREDITS = 103;
  private ERR_ALREADY_MATCHED = 104;
  private ERR_PAUSED = 105;
  private ERR_INVALID_AMOUNT = 106;
  private ERR_MATCH_FAILED = 107;
  private ERR_INVALID_MODE = 108;
  private ERR_METADATA_TOO_LONG = 109;
  private ERR_NO_PENDING_MATCH = 110;
  private ERR_GOVERNANCE = 111;
  private MAX_METADATA_LEN = 500;
  private AUTO_MATCH = 1;
  private MANUAL_MATCH = 2;
  private blockHeight = 1000;

  // Helper to simulate block height increase
  private advanceBlock() {
    this.blockHeight += 1;
  }

  isOwnerOrGovernance(caller: string): boolean {
    return caller === this.state.owner || caller === "governance"; // Mock governance
  }

  getMatchDetails(flightId: number): ClarityResponse<MatchRecord | null> {
    return { ok: true, value: this.state.matches.get(flightId) ?? null };
  }

  getPendingMatch(flightId: number): ClarityResponse<PendingMatch | null> {
    return { ok: true, value: this.state.pendingMatches.get(flightId) ?? null };
  }

  getAutoPreference(user: string): ClarityResponse<AutoPreference | null> {
    return { ok: true, value: this.state.autoPreferences.get(user) ?? null };
  }

  getContractState(): ClarityResponse<{
    owner: string;
    paused: boolean;
    fee: number;
    threshold: number;
  }> {
    return {
      ok: true,
      value: {
        owner: this.state.owner,
        paused: this.state.isPaused,
        fee: this.state.matchFee,
        threshold: this.state.autoMatchThreshold,
      },
    };
  }

  setAutoMatchPreference(
    caller: string,
    preferredProjects: number[],
    minCreditsPerProject: number,
    maxFee: number
  ): ClarityResponse<boolean> {
    this.state.autoPreferences.set(caller, {
      preferredProjects,
      minCreditsPerProject,
      maxFee,
    });
    return { ok: true, value: true };
  }

  autoMatch(caller: string, flightId: number, metadata: string): ClarityResponse<boolean> {
    if (this.state.isPaused) return { ok: false, value: this.ERR_PAUSED };
    if (metadata.length > this.MAX_METADATA_LEN) return { ok: false, value: this.ERR_METADATA_TOO_LONG };

    const prefs = this.state.autoPreferences.get(caller);
    if (!prefs) return { ok: false, value: this.ERR_NO_PENDING_MATCH };

    const emissions = this.state.flightEmissions.get(flightId);
    if (!emissions) return { ok: false, value: this.ERR_INVALID_FLIGHT };
    if (this.state.matches.has(flightId)) return { ok: false, value: this.ERR_ALREADY_MATCHED };

    const projectIds = prefs.preferredProjects;
    let totalCredits = 0;
    for (const id of projectIds) {
      if (!this.state.verifiedProjects.has(id)) return { ok: false, value: this.ERR_INVALID_PROJECT };
      const credits = this.state.projectCredits.get(id) ?? 0;
      totalCredits += credits;
    }

    if (totalCredits < emissions) return { ok: false, value: this.ERR_INSUFFICIENT_CREDITS };

    // Deduct credits
    for (const id of projectIds) {
      const credits = this.state.projectCredits.get(id) ?? 0;
      this.state.projectCredits.set(id, credits - credits); // Full deduct for simplicity
    }

    // Record match
    this.state.matches.set(flightId, {
      projectIds,
      matchedCredits: totalCredits,
      timestamp: this.blockHeight,
      matcher: caller,
      mode: this.AUTO_MATCH,
      metadata,
      retired: false,
    });

    // Mint tokens mock
    const currentMinted = this.state.mintedTokens.get(caller) ?? 0;
    this.state.mintedTokens.set(caller, currentMinted + totalCredits);

    this.state.matchCounter += 1;
    this.advanceBlock();
    return { ok: true, value: true };
  }

  manualMatch(
    caller: string,
    flightId: number,
    projectIds: number[],
    metadata: string
  ): ClarityResponse<boolean> {
    if (this.state.isPaused) return { ok: false, value: this.ERR_PAUSED };
    if (metadata.length > this.MAX_METADATA_LEN) return { ok: false, value: this.ERR_METADATA_TOO_LONG };

    const emissions = this.state.flightEmissions.get(flightId);
    if (!emissions) return { ok: false, value: this.ERR_INVALID_FLIGHT };
    if (this.state.matches.has(flightId)) return { ok: false, value: this.ERR_ALREADY_MATCHED };

    let totalCredits = 0;
    for (const id of projectIds) {
      if (!this.state.verifiedProjects.has(id)) return { ok: false, value: this.ERR_INVALID_PROJECT };
      const credits = this.state.projectCredits.get(id) ?? 0;
      totalCredits += credits;
    }

    if (totalCredits < emissions) return { ok: false, value: this.ERR_INSUFFICIENT_CREDITS };

    // Deduct credits
    for (const id of projectIds) {
      const credits = this.state.projectCredits.get(id) ?? 0;
      this.state.projectCredits.set(id, credits - credits);
    }

    // Record match
    this.state.matches.set(flightId, {
      projectIds,
      matchedCredits: totalCredits,
      timestamp: this.blockHeight,
      matcher: caller,
      mode: this.MANUAL_MATCH,
      metadata,
      retired: false,
    });

    // Mint tokens mock
    const currentMinted = this.state.mintedTokens.get(caller) ?? 0;
    this.state.mintedTokens.set(caller, currentMinted + totalCredits);

    this.state.matchCounter += 1;
    this.advanceBlock();
    return { ok: true, value: true };
  }

  proposePendingMatch(
    caller: string,
    flightId: number,
    projectIds: number[],
    expiry: number
  ): ClarityResponse<boolean> {
    if (this.state.matches.has(flightId)) return { ok: false, value: this.ERR_ALREADY_MATCHED };

    let totalCredits = 0;
    for (const id of projectIds) {
      totalCredits += this.state.projectCredits.get(id) ?? 0;
    }

    this.state.pendingMatches.set(flightId, {
      proposedProjectIds: projectIds,
      proposedCredits: totalCredits,
      proposer: caller,
      expiry: this.blockHeight + expiry,
    });

    return { ok: true, value: true };
  }

  approvePendingMatch(caller: string, flightId: number, metadata: string): ClarityResponse<boolean> {
    const pending = this.state.pendingMatches.get(flightId);
    if (!pending) return { ok: false, value: this.ERR_NO_PENDING_MATCH };
    if (this.blockHeight > pending.expiry) return { ok: false, value: this.ERR_NO_PENDING_MATCH };
    if (caller !== this.state.owner) return { ok: false, value: this.ERR_UNAUTHORIZED }; // Mock flight owner as contract owner

    const result = this.manualMatch(caller, flightId, pending.proposedProjectIds, metadata);
    if (result.ok) {
      this.state.pendingMatches.delete(flightId);
    }
    return result;
  }

  retireMatch(caller: string, flightId: number): ClarityResponse<boolean> {
    const match = this.state.matches.get(flightId);
    if (!match) return { ok: false, value: this.ERR_INVALID_FLIGHT };
    if (caller !== match.matcher) return { ok: false, value: this.ERR_UNAUTHORIZED };

    this.state.matches.set(flightId, { ...match, retired: true });

    // Retire tokens mock
    const currentRetired = this.state.retiredTokens.get(caller) ?? 0;
    this.state.retiredTokens.set(caller, currentRetired + match.matchedCredits);

    return { ok: true, value: true };
  }

  pauseContract(caller: string): ClarityResponse<boolean> {
    if (!this.isOwnerOrGovernance(caller)) return { ok: false, value: this.ERR_UNAUTHORIZED };
    this.state.isPaused = true;
    return { ok: true, value: true };
  }

  unpauseContract(caller: string): ClarityResponse<boolean> {
    if (!this.isOwnerOrGovernance(caller)) return { ok: false, value: this.ERR_UNAUTHORIZED };
    this.state.isPaused = false;
    return { ok: true, value: true };
  }

  setMatchFee(caller: string, newFee: number): ClarityResponse<boolean> {
    if (!this.isOwnerOrGovernance(caller)) return { ok: false, value: this.ERR_UNAUTHORIZED };
    this.state.matchFee = newFee;
    return { ok: true, value: true };
  }

  setAutoMatchThreshold(caller: string, newThreshold: number): ClarityResponse<boolean> {
    if (!this.isOwnerOrGovernance(caller)) return { ok: false, value: this.ERR_UNAUTHORIZED };
    this.state.autoMatchThreshold = newThreshold;
    return { ok: true, value: true };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  user1: "wallet_1",
  user2: "wallet_2",
};

describe("OffsetMatcher Contract", () => {
  let contract: OffsetMatcherMock;

  beforeEach(() => {
    contract = new OffsetMatcherMock();
    vi.resetAllMocks();
  });

  it("should initialize with correct state", () => {
    const state = contract.getContractState();
    expect(state).toEqual({
      ok: true,
      value: {
        owner: "deployer",
        paused: false,
        fee: 100,
        threshold: 1000,
      },
    });
  });

  it("should set auto-match preferences", () => {
    const result = contract.setAutoMatchPreference(accounts.user1, [1, 2], 500, 200);
    expect(result).toEqual({ ok: true, value: true });

    const prefs = contract.getAutoPreference(accounts.user1);
    expect(prefs).toEqual({
      ok: true,
      value: {
        preferredProjects: [1, 2],
        minCreditsPerProject: 500,
        maxFee: 200,
      },
    });
  });

  it("should perform auto-match successfully", () => {
    contract.setAutoMatchPreference(accounts.user1, [1, 2], 500, 200);

    const result = contract.autoMatch(accounts.user1, 1, "Auto match metadata");
    expect(result).toEqual({ ok: true, value: true });

    const match = contract.getMatchDetails(1);
    expect(match.value).toEqual(expect.objectContaining({
      projectIds: [1, 2],
      matchedCredits: 6000,
      mode: 1,
      retired: false,
    }));
  });

  it("should fail auto-match if insufficient credits", () => {
    contract.setAutoMatchPreference(accounts.user1, [3], 500, 200);

    const result = contract.autoMatch(accounts.user1, 1, "Insufficient");
    expect(result).toEqual({ ok: false, value: 103 });
  });

  it("should perform manual-match successfully", () => {
    const result = contract.manualMatch(accounts.user1, 2, [2, 3], "Manual metadata");
    expect(result).toEqual({ ok: true, value: true });

    const match = contract.getMatchDetails(2);
    expect(match.value).toEqual(expect.objectContaining({
      projectIds: [2, 3],
      matchedCredits: 5000,
      mode: 2,
      retired: false,
    }));
  });

  it("should propose and approve pending match", () => {
    const proposeResult = contract.proposePendingMatch(accounts.user2, 1, [1, 2], 10);
    expect(proposeResult).toEqual({ ok: true, value: true });

    const pending = contract.getPendingMatch(1);
    expect(pending.value).toEqual(expect.objectContaining({
      proposedProjectIds: [1, 2],
      proposedCredits: 6000,
    }));

    const approveResult = contract.approvePendingMatch(accounts.deployer, 1, "Approved metadata");
    expect(approveResult).toEqual({ ok: true, value: true });

    const match = contract.getMatchDetails(1);
    expect(match.value).toBeDefined();
    expect(contract.getPendingMatch(1).value).toBeNull();
  });

  it("should retire match successfully", () => {
    contract.manualMatch(accounts.user1, 1, [1, 2], "To retire");

    const retireResult = contract.retireMatch(accounts.user1, 1);
    expect(retireResult).toEqual({ ok: true, value: true });

    const match = contract.getMatchDetails(1);
    expect(match.value?.retired).toBe(true);
  });

  it("should pause and unpause contract", () => {
    const pauseResult = contract.pauseContract(accounts.deployer);
    expect(pauseResult).toEqual({ ok: true, value: true });
    expect(contract.getContractState().value.paused).toBe(true);

    const matchDuringPause = contract.manualMatch(accounts.user1, 1, [1], "Paused");
    expect(matchDuringPause).toEqual({ ok: false, value: 105 });

    const unpauseResult = contract.unpauseContract(accounts.deployer);
    expect(unpauseResult).toEqual({ ok: true, value: true });
    expect(contract.getContractState().value.paused).toBe(false);
  });

  it("should prevent unauthorized pause", () => {
    const pauseResult = contract.pauseContract(accounts.user1);
    expect(pauseResult).toEqual({ ok: false, value: 100 });
  });

  it("should update match fee", () => {
    const result = contract.setMatchFee(accounts.deployer, 200);
    expect(result).toEqual({ ok: true, value: true });
    expect(contract.getContractState().value.fee).toBe(200);
  });

  it("should fail metadata too long", () => {
    const longMetadata = "a".repeat(501);
    const result = contract.manualMatch(accounts.user1, 1, [1, 2], longMetadata);
    expect(result).toEqual({ ok: false, value: 109 });
  });
});