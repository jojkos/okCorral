import type { StrongWindState, WalkingWomanState, WindDirection } from "../shared/types.js";

export const STRONG_WIND_CHANCE = 0.35;
export const FIRST_STRONG_WIND_ROUND = 5;
export const WALKING_WOMAN_CHANCE = 0.2;
export const FIRST_WALKING_WOMAN_ROUND = 3;

export function initialStrongWindState(): StrongWindState {
  return {
    phase: "calm",
    direction: null,
    activeRoundsRemaining: 0,
    cooldownRoundsRemaining: 0,
  };
}

export function initialWalkingWomanState(): WalkingWomanState {
  return {
    phase: "inactive",
    direction: null,
    slot: null,
    fromSlot: null,
    cooldownRoundsRemaining: 0,
    bloodTrail: [],
    killedFromTeam: null,
  };
}

/** Move the woman exactly one lane at the start of each subsequent round. */
export function advanceWalkingWoman(
  previous: WalkingWomanState,
  upcomingRound: number,
  slotsPerSide: number,
  wind: StrongWindState,
  random: () => number = Math.random,
): WalkingWomanState {
  if (previous.phase === "walking" && previous.slot !== null && previous.direction) {
    if (previous.slot < 0 || previous.slot >= slotsPerSide) {
      return { ...previous, phase: "gone", direction: null, slot: null, fromSlot: null };
    }
    const slot = previous.slot + (previous.direction === "down" ? 1 : -1);
    return { ...previous, fromSlot: previous.slot, slot };
  }

  if (previous.phase === "dead") {
    if (previous.slot !== null && (previous.slot < 0 || previous.slot >= slotsPerSide)) {
      return { ...previous, phase: "gone", direction: null, slot: null, fromSlot: null };
    }
    if (previous.slot === null || wind.phase !== "active" || !wind.direction) {
      return { ...previous, fromSlot: previous.slot };
    }
    const slot = previous.slot + (wind.direction === "down" ? 1 : -1);
    const bloodTrail = [...previous.bloodTrail, slot];
    return { ...previous, direction: wind.direction, fromSlot: previous.slot, slot, bloodTrail };
  }

  if (previous.phase === "gone") return previous;

  const cooldownRoundsRemaining = Math.max(0, previous.cooldownRoundsRemaining - 1);
  if (cooldownRoundsRemaining > 0 || upcomingRound < FIRST_WALKING_WOMAN_ROUND) {
    return { ...initialWalkingWomanState(), cooldownRoundsRemaining };
  }
  if (random() >= WALKING_WOMAN_CHANCE) return initialWalkingWomanState();

  const direction: WindDirection = random() < 0.5 ? "down" : "up";
  return {
    phase: "walking",
    direction,
    slot: direction === "down" ? 0 : slotsPerSide - 1,
    fromSlot: direction === "down" ? -1 : slotsPerSide,
    cooldownRoundsRemaining: 0,
    bloodTrail: [],
    killedFromTeam: null,
  };
}

/**
 * Advance the event once at the beginning of a planning round.
 * The warning is allowed one round before the first active round, while the
 * cooldown value describes the current (fully calm) round.
 */
export function advanceStrongWind(
  previous: StrongWindState,
  upcomingRound: number,
  random: () => number = Math.random,
): StrongWindState {
  if (previous.phase === "warning") {
    return {
      phase: "active",
      direction: previous.direction,
      activeRoundsRemaining: 2,
      cooldownRoundsRemaining: 0,
    };
  }

  if (previous.phase === "active") {
    if (previous.activeRoundsRemaining > 1) {
      return { ...previous, activeRoundsRemaining: previous.activeRoundsRemaining - 1 };
    }
    return {
      phase: "calm",
      direction: null,
      activeRoundsRemaining: 0,
      cooldownRoundsRemaining: 1,
    };
  }

  const cooldownRoundsRemaining = Math.max(0, previous.cooldownRoundsRemaining - 1);
  const firstWarningRound = FIRST_STRONG_WIND_ROUND - 1;
  if (cooldownRoundsRemaining > 0 || upcomingRound < firstWarningRound) {
    return { ...initialStrongWindState(), cooldownRoundsRemaining };
  }

  if (random() >= STRONG_WIND_CHANCE) {
    return initialStrongWindState();
  }

  const direction: WindDirection = random() < 0.5 ? "up" : "down";
  return {
    phase: "warning",
    direction,
    activeRoundsRemaining: 0,
    cooldownRoundsRemaining: 0,
  };
}
