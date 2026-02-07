# Game Design Document: OkCorral

## 1. Overview

**Title:** OkCorral
**Genre:** Multiplayer Turn-Based Tactical Arena
**Theme:** Western Saloon Shootout
**Platform:** Web (Desktop Host + Mobile Controllers)

### Concept

A party-game-style experience where one screen (the **Host**) acts as the main game board/arena, and players use their smartphones as controllers. Players are split into two teams (**Sheriffs** vs **Outlaws**) and compete to eliminate the opposing team in a synchronized, turn-based tactical shootout.

---

## 2. Architecture & Roles

### Host ("TV" Screen)

**Role:** Passive display and game orchestrator.

**Responsibilities:**

- **Lobby Creation:** Generates a unique 4-letter Room Code.
- **QR Code Deployment:** Displays a QR code that players scan to instantly join.
- **Game Render:** Displays the two opposing sides, slots, barrels (cover), and all projectile animations.
- **Audio:** Plays background music and sound effects.
- **Persistence:** Room Code is synced to the URL (`?code=ABCD`, letters only). On browser refresh, the Host automatically rejoins the same session.

---

### Client (Controller – Mobile)

**Role:** Active input device for players.

**Responsibilities:**

- **Joining:** Join via Room Code or QR Code link.
- **Player Identity:** Player chooses a **display name** when joining.
- **Team Selection:** Players manually choose their team (Sheriffs vs Outlaws) and may switch sides in the lobby.
- **Slot Assignment:** Slot is assigned **randomly** when joining a team.
- **Input:** Responsive D-Pad (Up / Down only) and Action buttons.
- **Action Locking:** Action is **locked immediately on first tap** and cannot be changed for that tick.
- **Persistence:** Session data stored in `sessionStorage`. Refresh automatically reconnects the player to their character.
- **Visuals:** Highly responsive, mobile-first UI.
- **Audio & Haptics:**
  - Player receives personal sound effects for events affecting them (hit, barrel hit, etc.).
  - Haptic feedback when action is locked in.

---

### Server

**Role:** Central State Authority (Single Source of Truth).

**Responsibilities:**

- **State Management:** Holds the full authoritative game state.
- **Tick System:** Runs the global game timer.
- **Action Resolution:** Processes all simultaneous moves, shots, and interactions.
- **Validation:**
  - All actions are validated server-side only.
  - Invalid actions are silently ignored.

- **Broadcasting:** Optimized state updates sent to all connected clients.
- **Disconnections:**
  - If a player disconnects, their character remains idle.
  - Reconnecting players may rejoin **at any time**, including mid-round, and continue seamlessly.

---

## 3. Game Mechanics

### Match Structure & Win Conditions

- **Game Start Control:** Once the lobby is created, the Host is fully passive. The game is controlled entirely from mobile devices.

- **Start Condition:** If all players are assigned to a team, **any player** may start the game via a Start button on their controller.

- **Readiness:** No explicit Ready button is required. Team selection alone is sufficient.

- **Win Condition:** A round is won when **all players on one team are eliminated**.

- **Victory Feedback:** The Host displays a clear end screen showing which team won. Each client also receives clear feedback.

- **Draw Condition:** If both teams are eliminated in the same tick, the game ends in a **DRAW**.

- **Post-Game Flow:** After a game ends, players are prompted to:
  - **End Game** (session closes)
  - **Play Again** (returns all players to the lobby, teams can be changed)

- **Game Scope:** Each game is fully self-contained. There is no persistence or carry-over between games.

### Rounds vs Ticks Clarification

- A "round" refers to a **single planning + resolution cycle (tick)**.
- Between ticks, **nothing resets or regenerates** except the effects of chosen actions.

### Lobby Configuration (Host-controlled)

Before the game starts, the Host configures:

- **Round Duration:** Default 4 seconds (adjustable).
- **Slots per Side:** Number of vertical positions available per team.

**Constraints:**

- The game **CANNOT START** if players on a team exceed available slots.
- Teams may be uneven (e.g., 3 Sheriffs vs 5 Outlaws) as long as slot limits are respected.

**Joining Rules:**

- Players may join **only during the lobby phase**.
- Late joining after the game has started is **not allowed**.

---

### Map & Environment ("The Standoff")

- **Structure:** No grid. Two opposing vertical lines (Left vs Right).
- **Slots:** Each side has `N` vertically stacked slots.
- **Movement:** Players can ONLY move **Up / Down** between slots on their side.

#### Barrels (Cover)

- **Slot Ownership:** Barrels belong to slots, not players.

- **Persistence:** Once a barrel is destroyed, it remains destroyed for the **rest of the game**, even if another player moves into that slot.

- **HP:** 3 HP per barrel (with visual degradation).

- **Function:** Blocks incoming bullets while the player is in COVER state.

- **Visuals:** Default barrel is small/low. When covering, barrel visually "activates".

- **Placement:** Each slot has exactly one barrel positioned in front of it (toward the center).

- **HP:** 3 HP per barrel (with visual degradation).

- **Function:** Blocks incoming bullets while the player is in **COVER** state.

- **Visuals:** Default barrel is small/low. When covering, barrel visually "activates" (player ducks).

---

### Core Loop (Tick-Based System)

The game runs in synchronized ticks.

#### Planning Phase (Default: 4000 ms)

- The planning phase **always lasts the full duration** (default 4 seconds), even if all players lock in their actions early.

**UI Feedback:**

- **Host:** Large countdown timer and/or depleting progress bar.
- **Client:** Matching synced timer/progress bar.

**Action Selection:**

- Each player selects **ONE** action.
- Action is locked immediately on first tap.
- Host displays "Ready" indicators for players who have locked in an action.

---

#### Resolution Phase (Instant)

All actions resolve simultaneously.

**Actions:**

- **Move:** Switch slots (Up / Down).
  - Players can only move to empty slots.
  - Players cannot move through or over other players.
  - Moving players are always considered **uncovered** after the move.
  - If multiple players attempt to move to the same empty slot, the first processed by the server succeeds; others remain in place.

- **Cover:** Player ducks behind their barrel.
  - Cover is considered **active in the same tick** it is selected.

- **Shoot:** Fires a bullet toward the opposing side.
  - Requires at least **1 ammo**. Button is disabled at 0 ammo.
  - **Trajectory Options:**
    - Straight (same lane)
    - Diagonal Up (one lane up)
    - Diagonal Down (one lane down)

  - If the targeted lane does not contain a valid enemy target, the shot **misses and does nothing**.
  - Friendly fire is **not possible**.

- **Reload:** Gain +1 ammo (up to max 3).
  - Reload is disabled when ammo is already full.

**Collision & Damage Rules:**

- Bullet vs Bullet → both destroyed ("Clang!").
- Bullet vs Covered Player with Barrel HP > 0 → barrel takes damage.
- Bullet vs Player (uncovered or barrel destroyed) → player takes damage.
- **Damage Values:**
  - Each bullet deals **1 damage**.
  - Multiple bullets can hit the same barrel or player in a single tick, dealing cumulative damage.

---

#### Update Phase

- Host plays animations.
- Server checks for team elimination.

---

## 4. User Interface (UI)

### Host UI (TV Screen)

**Top Bar:**

- Round timer / progress bar (prominent).
- Current tick count.
- Team alive count.

**Main Arena:**

- Left: Sheriffs (Blue) | Right: Outlaws (Red).
- Clear slot separation.
- Player avatars with HP bars and ammo counters.
- Death is clearly visualized via animation (e.g., collapse, fade-out, or marker).

**Feedback & Audio:**

- Large text overlays: "DRAW!", "SHOOT!", "WINNER!".
- Visual representation of all actions.
- Global, merged sound effects for major events (volleys, impacts).

**Top Bar:**

- Round timer / progress bar (prominent).
- Current tick count.
- Team alive count.

**Main Arena:**

- Left: Sheriffs (Blue) | Right: Outlaws (Red).
- Clear slot separation.
- Player avatars with HP bars and ammo counters.

**Feedback & Audio:**

- Large text overlays: "DRAW!", "SHOOT!", "WINNER!".
- Visual representation of all actions.
- Global, merged sound effects for major events (volleys, impacts).

---

### Client UI (Mobile)

**Layout:** Portrait-oriented.

**Header:**

- Mini timer / progress bar (synced with Host).
- Personal HP (hearts) and ammo (bullets).

**Controls:**

- **Left:** Large Up / Down buttons.
- **Right:** Action buttons (Shoot, Cover, Reload).

**Dead State:**

- When HP reaches 0, the player enters a **static "You're Dead" screen**.
- Controls are disabled.
- Player remains connected as a spectator.

**Feedback:**

- Button press states (active / pressed).
- Haptic vibration when an action is locked in.

**Layout:** Portrait-oriented.

**Header:**

- Mini timer / progress bar (synced with Host).
- Personal HP (hearts) and ammo (bullets).

**Controls:**

- **Left:** Large Up / Down buttons.
- **Right:** Action buttons (Shoot, Cover, Reload).

**Feedback:**

- Button press states (active / pressed).
- Haptic vibration when an action is locked in.

---

## 5. Technology Stack

- **Frontend:** React, Vite, Tailwind CSS.
- **Backend:** Node.js, Express.
- **Communication:** socket.io (instead of native WebSockets).
- **Validation:** zod.

---

## 6. Core Stats

**Player:**

- HP: 3 (eliminated at 0).
- Ammo: Starts at 1 / 3. Max 3.

**Environment:**

- Barrel HP: 3 (destroyed at 0).
