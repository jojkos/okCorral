import type {
  GameState,
  Player,
  Bullet,
  ActionType,
  Team,
} from "../shared/types.js";

interface ActionResult {
  state: GameState;
  bullets: Bullet[];
}

interface PendingBullet {
  id: string;
  shooter: Player;
  targetSlot: number;
  trajectory: "straight" | "up" | "down";
}

let bulletIdCounter = 0;

export function resolveActions(state: GameState): ActionResult {
  const bullets: Bullet[] = [];
  const pendingBullets: PendingBullet[] = [];

  // Deep clone the state to avoid mutations
  const newState: GameState = JSON.parse(JSON.stringify(state));

  // Group players by team for easier access
  const sheriffs = newState.players.filter(
    (p) => p.team === "sheriffs" && p.isAlive && p.slot >= 0,
  );
  const outlaws = newState.players.filter(
    (p) => p.team === "outlaws" && p.isAlive && p.slot >= 0,
  );

  // Process moves first (before shooting)
  const moveAttempts: { player: Player; targetSlot: number }[] = [];

  newState.players.forEach((player) => {
    if (!player.isAlive || player.slot < 0) return;

    if (player.currentAction === "MOVE_UP") {
      const targetSlot = player.slot - 1;
      if (targetSlot >= 0) {
        moveAttempts.push({ player, targetSlot });
      }
    } else if (player.currentAction === "MOVE_DOWN") {
      const targetSlot = player.slot + 1;
      if (targetSlot < newState.config.slotsPerSide) {
        moveAttempts.push({ player, targetSlot });
      }
    }
  });

  // Resolve moves - check for collisions
  const slotOccupancy = new Map<string, string>(); // "team-slot" -> playerId

  // First, mark current positions (excluding movers)
  newState.players.forEach((p) => {
    if (
      p.isAlive &&
      p.slot >= 0 &&
      !moveAttempts.find((m) => m.player.id === p.id)
    ) {
      slotOccupancy.set(`${p.team}-${p.slot}`, p.id);
    }
  });

  // Process moves in order, first come first served
  moveAttempts.forEach(({ player, targetSlot }) => {
    const key = `${player.team}-${targetSlot}`;
    if (!slotOccupancy.has(key)) {
      // Slot is free, move there
      slotOccupancy.set(key, player.id);
      player.slot = targetSlot;
      player.isCovered = false; // Moving makes you uncovered
    }
    // If slot is taken, player stays in place
  });

  // Process cover
  newState.players.forEach((player) => {
    if (!player.isAlive || player.slot < 0) return;

    if (player.currentAction === "COVER") {
      player.isCovered = true;
    } else if (!player.currentAction.startsWith("MOVE")) {
      // Any action except COVER and MOVE removes cover
      // This runs BEFORE shooting calculation, so if you select COVER,
      // isCovered becomes true immediately for this round's defense.
      player.isCovered = false;
    }
  });

  // Process reload
  newState.players.forEach((player) => {
    if (!player.isAlive || player.slot < 0) return;

    if (player.currentAction === "RELOAD") {
      player.ammo = Math.min(3, player.ammo + 1);
    }
  });

  // Process shooting - collect all bullets
  newState.players.forEach((player) => {
    if (!player.isAlive || player.slot < 0) return;
    if (player.ammo <= 0) return;

    let targetSlot = -1;
    let trajectory: "straight" | "up" | "down" = "straight";

    if (player.currentAction === "SHOOT_STRAIGHT") {
      targetSlot = player.slot;
      trajectory = "straight";
    } else if (player.currentAction === "SHOOT_UP") {
      targetSlot = player.slot - 1;
      trajectory = "up";
    } else if (player.currentAction === "SHOOT_DOWN") {
      targetSlot = player.slot + 1;
      trajectory = "down";
    }

    if (targetSlot >= 0 && targetSlot < newState.config.slotsPerSide) {
      player.ammo--;
      pendingBullets.push({
        id: `bullet-${++bulletIdCounter}`,
        shooter: player,
        targetSlot,
        trajectory,
      });
    }
  });

  // Check for bullet collisions (bullets from opposite sides at same slot pair)
  const sheriffBullets = pendingBullets.filter(
    (b) => b.shooter.team === "sheriffs",
  );
  const outlawBullets = pendingBullets.filter(
    (b) => b.shooter.team === "outlaws",
  );

  const collidedBullets = new Set<string>();

  // Check each sheriff bullet against outlaw bullets for collision
  sheriffBullets.forEach((sBullet) => {
    outlawBullets.forEach((oBullet) => {
      // Bullets collide if they cross paths
      // Sheriff shoots right, Outlaw shoots left
      // They collide if their target lanes would intersect
      // Simplified: if both shooting at each other's lanes
      if (
        sBullet.shooter.slot === oBullet.targetSlot &&
        oBullet.shooter.slot === sBullet.targetSlot
      ) {
        collidedBullets.add(sBullet.id);
        collidedBullets.add(oBullet.id);

        bullets.push({
          id: sBullet.id,
          fromTeam: "sheriffs",
          fromSlot: sBullet.shooter.slot,
          toSlot: sBullet.targetSlot,
          trajectory: sBullet.trajectory,
          hit: "bullet",
        });
        bullets.push({
          id: oBullet.id,
          fromTeam: "outlaws",
          fromSlot: oBullet.shooter.slot,
          toSlot: oBullet.targetSlot,
          trajectory: oBullet.trajectory,
          hit: "bullet",
        });
      }
    });
  });

  // Process remaining bullets
  pendingBullets.forEach((bullet) => {
    if (collidedBullets.has(bullet.id)) return;

    const targetTeam: Team =
      bullet.shooter.team === "sheriffs" ? "outlaws" : "sheriffs";
    const targetPlayer = newState.players.find(
      (p) => p.team === targetTeam && p.slot === bullet.targetSlot && p.isAlive,
    );

    if (!targetPlayer) {
      // Miss - no target in that slot
      bullets.push({
        id: bullet.id,
        fromTeam: bullet.shooter.team,
        fromSlot: bullet.shooter.slot,
        toSlot: bullet.targetSlot,
        trajectory: bullet.trajectory,
        hit: "miss",
      });
      return;
    }

    // Check if target is covered and has barrel
    const targetBarrel = newState.barrels.find(
      (b) => b.team === targetTeam && b.slot === bullet.targetSlot,
    );

    if (targetPlayer.isCovered && targetBarrel && targetBarrel.hp > 0) {
      // Hit barrel
      targetBarrel.hp--;
      bullets.push({
        id: bullet.id,
        fromTeam: bullet.shooter.team,
        fromSlot: bullet.shooter.slot,
        toSlot: bullet.targetSlot,
        trajectory: bullet.trajectory,
        hit: "barrel",
      });
    } else {
      // Hit player
      targetPlayer.hp--;
      if (targetPlayer.hp <= 0) {
        targetPlayer.isAlive = false;
      }
      bullets.push({
        id: bullet.id,
        fromTeam: bullet.shooter.team,
        fromSlot: bullet.shooter.slot,
        toSlot: bullet.targetSlot,
        trajectory: bullet.trajectory,
        hit: "player",
      });
    }
  });

  return { state: newState, bullets };
}
