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
  aimedSlot: number;
  targetSlot: number;
  trajectory: "straight" | "up" | "down";
  offBoard: boolean;
}

let bulletIdCounter = 0;

export function resolveActions(state: GameState): ActionResult {
  const bullets: Bullet[] = [];
  const pendingBullets: PendingBullet[] = [];

  // Deep clone the state to avoid mutations
  const newState: GameState = JSON.parse(JSON.stringify(state));
  newState.lastTickSuicides = [];

  // A player who hit the woman in the previous round loses this whole action:
  // the suicide resolves before movement, cover, reloads, or the volley.
  const suicidesDue = new Set(
    newState.pendingSuicides
      .filter((pending) => pending.dueTick <= newState.tick)
      .map((pending) => pending.playerId),
  );
  newState.pendingSuicides = newState.pendingSuicides.filter(
    (pending) => pending.dueTick > newState.tick,
  );
  for (const player of newState.players) {
    if (!suicidesDue.has(player.id) || !player.isAlive) continue;
    player.hp = 0;
    player.isAlive = false;
    newState.lastTickSuicides.push(player.id);
  }

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

  // Resolve moves - check for collisions and swap conflicts.
  // Players cannot phase through each other: if A and B would trade slots
  // in the same tick, both attempts fail and both stay put.
  const blockedMoverIds = new Set<string>();
  for (let i = 0; i < moveAttempts.length; i++) {
    for (let j = i + 1; j < moveAttempts.length; j++) {
      const a = moveAttempts[i];
      const b = moveAttempts[j];
      if (a.player.team !== b.player.team) continue;
      const swapping =
        a.player.slot === b.targetSlot && b.player.slot === a.targetSlot;
      if (swapping) {
        blockedMoverIds.add(a.player.id);
        blockedMoverIds.add(b.player.id);
      }
    }
  }

  const slotOccupancy = new Map<string, string>(); // "team-slot" -> playerId

  // Mark current positions (excluding movers whose move might succeed).
  // Blocked swap-movers stay put, so their current slot is reserved.
  newState.players.forEach((p) => {
    if (!p.isAlive || p.slot < 0) return;
    const attempt = moveAttempts.find((m) => m.player.id === p.id);
    if (!attempt || blockedMoverIds.has(p.id)) {
      slotOccupancy.set(`${p.team}-${p.slot}`, p.id);
    }
  });

  // Process moves in order, first come first served. Blocked movers skip.
  moveAttempts.forEach(({ player, targetSlot }) => {
    if (blockedMoverIds.has(player.id)) return;
    const key = `${player.team}-${targetSlot}`;
    if (!slotOccupancy.has(key)) {
      slotOccupancy.set(key, player.id);
      player.slot = targetSlot;
      player.isCovered = false;
    }
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

    let aimedSlot = -1;
    let trajectory: "straight" | "up" | "down" = "straight";

    if (player.currentAction === "SHOOT_STRAIGHT") {
      aimedSlot = player.slot;
      trajectory = "straight";
    } else if (player.currentAction === "SHOOT_UP") {
      aimedSlot = player.slot - 1;
      trajectory = "up";
    } else if (player.currentAction === "SHOOT_DOWN") {
      aimedSlot = player.slot + 1;
      trajectory = "down";
    }

    // Preserve the existing rule that an intrinsically off-board aim does not
    // fire. Once a legal shot is fired, active wind shifts its actual target;
    // a wind-blown shot still spends ammo even when that final target is out.
    if (aimedSlot >= 0 && aimedSlot < newState.config.slotsPerSide) {
      const windOffset = newState.strongWind.phase === "active"
        ? (newState.strongWind.direction === "up" ? -1 : 1)
        : 0;
      const targetSlot = aimedSlot + windOffset;
      player.ammo--;
      pendingBullets.push({
        id: `bullet-${++bulletIdCounter}`,
        shooter: player,
        aimedSlot,
        targetSlot,
        trajectory,
        offBoard: targetSlot < 0 || targetSlot >= newState.config.slotsPerSide,
      });
    }
  });

  // The bystander stands in the middle of the street and intercepts every
  // simultaneous shot ending in her lane before bullets can reach each other
  // or the opposing boardwalk.
  const womanSlot = newState.walkingWoman.phase === "walking"
    ? newState.walkingWoman.slot
    : null;
  const womanBullets = womanSlot === null
    ? []
    : pendingBullets.filter((b) => !b.offBoard && b.targetSlot === womanSlot);
  const womanBulletIds = new Set(womanBullets.map((b) => b.id));
  if (womanBullets.length) {
    newState.walkingWoman.phase = "dead";
    newState.walkingWoman.bloodTrail = womanSlot === null ? [] : [womanSlot];
    newState.walkingWoman.killedFromTeam = womanBullets[0].shooter.team;
    newState.walkingWoman.fromSlot = womanSlot;
    for (const bullet of womanBullets) {
      bullets.push({
        id: bullet.id,
        fromTeam: bullet.shooter.team,
        fromSlot: bullet.shooter.slot,
        aimedSlot: bullet.aimedSlot,
        toSlot: bullet.targetSlot,
        trajectory: bullet.trajectory,
        hit: "woman",
        shooterId: bullet.shooter.id,
      });
      if (!newState.pendingSuicides.some((p) => p.playerId === bullet.shooter.id)) {
        newState.pendingSuicides.push({ playerId: bullet.shooter.id, dueTick: newState.tick + 1 });
      }
    }
  }

  // Check for bullet collisions (bullets from opposite sides at same slot pair)
  const sheriffBullets = pendingBullets.filter(
    (b) => b.shooter.team === "sheriffs" && !b.offBoard && !womanBulletIds.has(b.id),
  );
  const outlawBullets = pendingBullets.filter(
    (b) => b.shooter.team === "outlaws" && !b.offBoard && !womanBulletIds.has(b.id),
  );

  const collidedBullets = new Set<string>();

  // Opposing bullets move at the same speed, so they can physically meet at
  // the street midpoint. Compare the midpoint of their curved paths: the
  // first half follows the chosen aim, then wind bends the final half.
  sheriffBullets.forEach((sBullet) => {
    outlawBullets.forEach((oBullet) => {
      const midpointLane = (b: PendingBullet) =>
        b.shooter.slot * 0.5 + b.aimedSlot * 0.25 + b.targetSlot * 0.25;
      if (Math.abs(midpointLane(sBullet) - midpointLane(oBullet)) < 0.001) {
        collidedBullets.add(sBullet.id);
        collidedBullets.add(oBullet.id);

        bullets.push({
          id: sBullet.id,
          fromTeam: "sheriffs",
          fromSlot: sBullet.shooter.slot,
          aimedSlot: sBullet.aimedSlot,
          toSlot: sBullet.targetSlot,
          trajectory: sBullet.trajectory,
          hit: "bullet",
          shooterId: sBullet.shooter.id,
        });
        bullets.push({
          id: oBullet.id,
          fromTeam: "outlaws",
          fromSlot: oBullet.shooter.slot,
          aimedSlot: oBullet.aimedSlot,
          toSlot: oBullet.targetSlot,
          trajectory: oBullet.trajectory,
          hit: "bullet",
          shooterId: oBullet.shooter.id,
        });
      }
    });
  });

  // Process remaining bullets
  pendingBullets.forEach((bullet) => {
    if (collidedBullets.has(bullet.id) || womanBulletIds.has(bullet.id)) return;

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
        aimedSlot: bullet.aimedSlot,
        toSlot: bullet.targetSlot,
        trajectory: bullet.trajectory,
        hit: "miss",
        shooterId: bullet.shooter.id,
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
        aimedSlot: bullet.aimedSlot,
        toSlot: bullet.targetSlot,
        trajectory: bullet.trajectory,
        hit: "barrel",
        shooterId: bullet.shooter.id,
        targetId: targetPlayer.id,
      });
    } else {
      // Hit player
      const wasAlive = targetPlayer.hp > 0;
      targetPlayer.hp--;
      if (targetPlayer.hp <= 0) {
        targetPlayer.isAlive = false;
      }
      bullets.push({
        id: bullet.id,
        fromTeam: bullet.shooter.team,
        fromSlot: bullet.shooter.slot,
        aimedSlot: bullet.aimedSlot,
        toSlot: bullet.targetSlot,
        trajectory: bullet.trajectory,
        hit: "player",
        shooterId: bullet.shooter.id,
        targetId: targetPlayer.id,
        lethal: wasAlive && targetPlayer.hp <= 0,
      });
    }
  });

  return { state: newState, bullets };
}
