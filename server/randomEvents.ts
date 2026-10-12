import type { GatlingManState, GatlingTarget, StrongWindState, WalkingWomanState, WindDirection } from "../shared/types.js";
import { slotLayout } from '../shared/arenaGeometry.js';
import { gatlingContact, gatlingCrushTrail } from '../shared/gatlingGeometry.js';

export const STRONG_WIND_CHANCE = 0.35;
export const FIRST_STRONG_WIND_ROUND = 5;
export const WALKING_WOMAN_CHANCE = 0.2;
export const FIRST_WALKING_WOMAN_ROUND = 3;
export const WALKING_WOMAN_RETURN_ROUNDS = 3;
export const GATLING_MAN_CHANCE = 0.2;
export const FIRST_GATLING_MAN_ROUND = 10;
export const GATLING_MAN_COOLDOWN_ROUNDS = 15;
export const GATLING_MAN_SHOTS = 8;

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

export function initialGatlingManState(): GatlingManState {
  return {
    phase: "inactive",
    cooldownRoundsRemaining: 0,
    targets: [],
  };
}

/** Roll one synchronized eight-shot burst, then enforce 15 complete quiet rounds. */
export function advanceGatlingMan(
  previous: GatlingManState,
  upcomingRound: number,
  slotsPerSide: number,
  random: () => number = Math.random,
): GatlingManState {
  if (previous.phase === "warning") {
    return { ...previous, phase: "active" };
  }
  if (previous.phase === "active") {
    return {
      phase: "inactive",
      cooldownRoundsRemaining: GATLING_MAN_COOLDOWN_ROUNDS,
      targets: [],
    };
  }

  const cooldownRoundsRemaining = Math.max(0, previous.cooldownRoundsRemaining - 1);
  if (cooldownRoundsRemaining > 0 || upcomingRound < FIRST_GATLING_MAN_ROUND) {
    return { ...initialGatlingManState(), cooldownRoundsRemaining };
  }
  if (random() >= GATLING_MAN_CHANCE) return initialGatlingManState();

  const targets: GatlingTarget[] = Array.from({ length: GATLING_MAN_SHOTS }, () => ({
    team: random() < 0.5 ? "sheriffs" : "outlaws",
    slot: Math.min(slotsPerSide - 1, Math.floor(random() * slotsPerSide)),
  }));
  return { phase: "warning", cooldownRoundsRemaining: 0, targets };
}

/** The moving carriage kills a living civilian or flattens an existing corpse.
 * A crush belongs to the event, never to a player (no suicide penalty). */
export function runOverWomanWithGatling(
  woman: WalkingWomanState,
  gatling: GatlingManState,
  slotsPerSide: number,
  leg: 'arrival' | 'departure' | 'both' = 'both',
): WalkingWomanState {
  if (gatling.phase !== "active" || (woman.phase !== "dead" && woman.phase !== "walking") || woman.slot === null || woman.crushedByGatling) {
    return woman;
  }
  const L = slotLayout(slotsPerSide);
  const contact = (leg !== 'departure' ? gatlingContact(L, woman, 'arrival') : null)
    ?? (leg !== 'arrival' ? gatlingContact(L, woman, 'departure') : null);
  if (!contact) return woman;
  const slot = contact.slot + 1;
  const gatlingCrush = { ...contact, before: {
    phase: woman.phase, slot: woman.slot, fromSlot: woman.fromSlot, direction: woman.direction,
    bloodTrail: [...woman.bloodTrail], killedFromTeam: woman.killedFromTeam,
  } };
  return {
    ...woman,
    phase: 'dead',
    crushedByGatling: true,
    gatlingCrushedThisRound: true,
    gatlingCrush,
    gatlingCrushSlot: contact.slot,
    killedFromTeam: woman.phase === 'walking' ? null : woman.killedFromTeam,
    cooldownRoundsRemaining: 0,
    direction: "down",
    fromSlot: contact.slot,
    slot,
    bloodTrail: gatlingCrushTrail(gatlingCrush),
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
  if (previous.gatlingCrushedThisRound) previous = { ...previous, gatlingCrushedThisRound: false, gatlingCrush: undefined };
  if (previous.phase === "walking" && previous.slot !== null && previous.direction) {
    if (previous.slot < 0 || previous.slot >= slotsPerSide) {
      return {
        ...previous, phase: "waiting", slot: null, fromSlot: null,
        direction: previous.direction === "down" ? "up" : "down",
        cooldownRoundsRemaining: WALKING_WOMAN_RETURN_ROUNDS,
      };
    }
    const slot = previous.slot + (previous.direction === "down" ? 1 : -1);
    return { ...previous, fromSlot: previous.slot, slot };
  }

  if (previous.phase === "dead") {
    if (previous.slot !== null && (previous.slot < 0 || previous.slot >= slotsPerSide)) {
      return { ...previous, phase: "gone", direction: null, slot: null, fromSlot: null };
    }
    if (previous.slot === null) {
      return { ...previous, fromSlot: previous.slot };
    }
    const direction = previous.crushedByGatling ? "down" : wind.phase === "active" ? wind.direction : null;
    if (!direction) return { ...previous, fromSlot: previous.slot };
    const slot = previous.slot + (direction === "down" ? 1 : -1);
    const bloodTrail = [...previous.bloodTrail, slot];
    return { ...previous, direction, fromSlot: previous.slot, slot, bloodTrail };
  }

  if (previous.phase === "gone") return previous;

  if (previous.phase === "waiting") {
    const cooldownRoundsRemaining = Math.max(0, previous.cooldownRoundsRemaining - 1);
    if (cooldownRoundsRemaining > 0) return { ...previous, cooldownRoundsRemaining };
    // Return from the edge she actually left, without rerolling a new person.
    return enterWalkingWoman(previous.direction ?? "down", slotsPerSide);
  }

  const cooldownRoundsRemaining = Math.max(0, previous.cooldownRoundsRemaining - 1);
  if (cooldownRoundsRemaining > 0 || upcomingRound < FIRST_WALKING_WOMAN_ROUND) {
    return { ...initialWalkingWomanState(), cooldownRoundsRemaining };
  }
  if (random() >= WALKING_WOMAN_CHANCE) return initialWalkingWomanState();

  const direction: WindDirection = random() < 0.5 ? "down" : "up";
  return enterWalkingWoman(direction, slotsPerSide);
}

function enterWalkingWoman(direction: WindDirection, slotsPerSide: number): WalkingWomanState {
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
