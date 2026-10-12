# OK Corral 🤠

A real-time, western-themed multiplayer shootout game where Sheriffs and Outlaws face off in a tactical grid battle. Built with React, Socket.io, and Tailwind CSS.


## 🚀 How to Run

### Prerequisites

- Node.js (v16+)
- npm

### Installation

1.  Clone the repository.
2.  Install dependencies:
    ```bash
    npm install
    ```

### Running the Game

Start both the **Client** (Vite) and **Server** (Node/Socket.io) concurrently:

```bash
npm run dev
```

- **Client**: http://localhost:5173
- **Host**: http://localhost:5173/host (or click "Start Hosting" on home)

## 🎮 How to Play

### Groups & Teams

- **Host**: Creates a room and displays the **Arena** on a big screen (TV/Projector).
- **Players**: Join via mobile phones using the Room Code.
- **Teams**: **Sheriffs** (Left) vs **Outlaws** (Right).

### The Game Loop

The game is played in simultaneous turns.

1.  **Planning Phase (10s)**:
    - Players secretly select an action on their phone controller.
    - Actions are locked in when selected.
2.  **Resolution Phase**:
    - All actions are revealed and resolved simultaneously on the Host screen.
    - Bullets fly, players move, and damage is dealt.

### Actions

- **Move (⬆️/⬇️)**: Move to an adjacent slot. **Dodges** incoming shots to your old slot.
- **Shoot (↗/→/↘)**: Fire a bullet straight or diagonally.
  - **Ammo**: You start with 1 bullet. Max 3.
- **Reload (🔄)**: Gain 1 Ammo.
- **Cover (🛡️)**: Hunker down behind your barrel.
  - Blocks incoming damage _if_ your barrel still has HP.
  - **Note**: Barrels can be destroyed!

### Winning

- Eliminate all members of the opposing team to win.
- If both teams die in the same turn, it's a **Draw**.

## 🛠️ Tech Stack

- **Frontend**: React, Tailwind CSS, Lucide Icons.
- **Backend**: Node.js, Socket.io.
- **State Management**: Server-authoritative state broadcast to clients.
- **design**: "Western Saloon" aesthetic with rich textures and animations.

## 🏗️ Project Structure

- `/src/client`: React app for controllers and join screens.
- `/src/host`: React components for the main game screen (Arena/Lobby).
- `/server`: socket.io logic (`rooms.ts`, `actions.ts`).
- `/shared`: Shared TypeScript types.

## What's on screen

- **Readable showdown**: each resolution plays as *reveal → move → volley → impact*. Every player's chosen action pops up above their head, dashed aim lines show exactly which lane each gun points at, then bullets fly.
- **Cover is obvious**: a covering player crouches *behind* their barrel (hat peeking out), the barrel glows in team colour and their plate reads `⛨ IN COVER`. Covering behind a broken barrel shows `⚠ NO COVER`.
- **Plates** on the outer edges show name, hearts and bullets; `READY` appears once a player has locked in. Barrels show their remaining strength as notches.
- **Drama**: hit-stop and screen shake on hits, hats fly on kills, round headlines (CLANG!, DOUBLE KILL, LAST ONE STANDING…), and a slow-motion zoom on the match-ending shot.
- **Sound**: the recorded *Dusty Silence* western soundtrack loops during matches through the existing music volume, mute and ducking controls, stereo-panned gunshots with canyon echo, ricochets, splinters, spurs, cylinder spins, 3‑2‑1 countdown ticks.
- **Phones**: lane mini-map, aim preview for every shot, threat warning, per-round recap, haptics; dead players spectate and send emotes to the TV.
- **Lobby/End**: add bots to fill seats, how-to-play card, MVP, awards and a per-player recap; a session score carries across "Play again".

Rules are unchanged; bots, stats, emotes and the session score are presentation only.

## Presentation and synchronization

The host and phones use a clock offset estimated from server replies. Action requests include the round number and its start timestamp, and the server acknowledges the confirmed choice. Reconnecting clients rejoin with their existing identity. State revisions prevent older messages from replacing newer rounds.

Resolution uses a shared server timestamp: action reveal at 0 ms, movement 450–850 ms, volley at 850 ms, impacts and health reveal at 1250 ms; the next round starts 2.6 s after resolution (3.6 s for the final volley). This is presentation only: the combat resolver and the planning duration are unchanged; only the pause for animations between rounds grew.

The phone controller supports W/S to move, A for cover, R to reload, Q/E for diagonal shots, and Space for a straight shot. Sound and reduced-motion controls are available in the bottom corner.

### Verification

- `npm run typecheck`
- `npm test`
- `npm run test:network` (requires a local server on port 3001, or set TEST_SERVER)
- `npm run build`
