# OK Corral 🤠

A real-time, western-themed multiplayer shootout game where Sheriffs and Outlaws face off in a tactical grid battle. Built with React, Socket.io, and Tailwind CSS.

![Game Screenshot](/Users/jonas/.gemini/antigravity/brain/ad2fe259-2228-45d4-af38-feafffb389ca/arena_polished_1770481732032.png)

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

## Presentation and synchronization

The host and phones use a clock offset estimated from server replies. Action requests include the round number and its start timestamp, and the server acknowledges the confirmed choice. Reconnecting clients rejoin with their existing identity. State revisions prevent older messages from replacing newer rounds.

Resolution uses a shared server timestamp: movement at 0–420 ms, volley at 420 ms, impacts and health reveal at 840 ms. This is presentation only; the existing combat resolver and planning/resolution durations are preserved.

The phone controller supports W/S to move, A for cover, R to reload, Q/E for diagonal shots, and Space for a straight shot. Sound and reduced-motion controls are available in the bottom corner.

### Verification

- `npm run typecheck`
- `npm test`
- `npm run test:network` (requires a local server on port 3001, or set TEST_SERVER)
- `npm run build`
