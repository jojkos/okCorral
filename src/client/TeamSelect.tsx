import type { ClientPlayer, GameState, Team, Player } from '../../shared/types';
import { socket } from '../socket';
import { WesternButton } from '../components/WesternButton';

interface TeamSelectProps {
  player: ClientPlayer;
  gameState: GameState;
  error: string | null;
  onSelectTeam: (team: Team) => void;
  onLeave: () => void;
}

export default function TeamSelect({ player, gameState, error, onSelectTeam, onLeave }: TeamSelectProps) {
  const { config, players } = gameState;
  
  const sheriffs = players.filter(p => p.team === 'sheriffs' && p.slot >= 0);
  const outlaws = players.filter(p => p.team === 'outlaws' && p.slot >= 0);
  const unassigned = players.filter(p => p.slot < 0);

  const sheriffsAvailable = config.slotsPerSide - sheriffs.length;
  const outlawsAvailable = config.slotsPerSide - outlaws.length;

  const canStartGame = sheriffs.length > 0 && outlaws.length > 0;
  const isSheriff = player.slot >= 0 && player.team === 'sheriffs';
  const isOutlaw = player.slot >= 0 && player.team === 'outlaws';

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-6">
      <div className="text-center mb-4 relative">
        <button
          className="absolute right-0 top-0 text-xs uppercase font-bold text-neutral-500 hover:text-neutral-700"
          onClick={onLeave}
        >
          Leave Room
        </button>
        <h1 className="text-2xl md:text-3xl uppercase text-amber-800">Pick a Side</h1>
        <p className="text-neutral-600">
          Welcome, <strong>{player.name}</strong>!
          {player.team && player.slot >= 0 && (
            <span className="ml-2 text-sm uppercase">
              (Slot {player.slot + 1} • {player.team})
            </span>
          )}
        </p>
        <p className="text-xs text-neutral-500 mt-1">
          Tap a team at any time to switch.
        </p>
      </div>

      {error && (
        <div className="text-red-700 text-center py-2 px-4 mb-4 bg-red-100 border-2 border-red-300 rounded-lg font-bold">
          {error}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
        <TeamPanel
          title="Sheriffs"
          emoji="⭐"
          team="sheriffs"
          isSelected={isSheriff}
          slotsPerSide={config.slotsPerSide}
          players={sheriffs}
          available={sheriffsAvailable}
          onSelect={onSelectTeam}
        />
        <TeamPanel
          title="Outlaws"
          emoji="💀"
          team="outlaws"
          isSelected={isOutlaw}
          slotsPerSide={config.slotsPerSide}
          players={outlaws}
          available={outlawsAvailable}
          onSelect={onSelectTeam}
        />
      </div>

      {unassigned.length > 0 && (
        <div className="western-card p-3 mt-4">
          <div className="text-xs uppercase text-neutral-500 font-bold mb-2">Picking Side</div>
          <div className="flex flex-wrap gap-2">
            {unassigned.map(p => (
              <span key={p.id} className="bg-amber-200 px-3 py-1 rounded-full text-sm font-semibold">
                🤠 {p.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6">
        {canStartGame ? (
          <WesternButton
            variant="primary"
            size="xl"
            className="w-full"
            onClick={() => socket.emit('startGame')}
          >
            🎮 Start Gunfight!
          </WesternButton>
        ) : (
          <p className="text-center text-neutral-500">
            Both teams need at least one player to start
          </p>
        )}
      </div>
    </div>
  );
}

interface TeamPanelProps {
  title: string;
  emoji: string;
  team: Team;
  isSelected: boolean;
  slotsPerSide: number;
  players: Player[];
  available: number;
  onSelect: (team: Team) => void;
}

function TeamPanel({
  title,
  emoji,
  team,
  isSelected,
  slotsPerSide,
  players,
  available,
  onSelect,
}: TeamPanelProps) {
  const isFull = available <= 0;
  const isDisabled = (isFull && !isSelected) || isSelected;
  const accent =
    team === 'sheriffs'
      ? { border: '#2563eb', shadow: '#1e40af', bar: 'bg-blue-600', text: 'text-blue-800' }
      : { border: '#dc2626', shadow: '#991b1b', bar: 'bg-red-600', text: 'text-red-800' };

  return (
    <button
      className={`western-card p-4 md:p-6 text-left transition-all active:translate-y-1 active:shadow-none relative overflow-hidden ${
        isSelected ? 'ring-2 ring-amber-500' : ''
      }`}
      onClick={() => {
        if (!isSelected) onSelect(team);
      }}
      disabled={isDisabled}
      style={{
        borderColor: accent.border,
        boxShadow: `4px 4px 0px 0px ${accent.shadow}`,
      }}
    >
      <div className={`absolute top-0 left-0 w-full h-2 ${accent.bar}`} />
      <div className="flex items-center gap-3 mb-3">
        <div className="text-4xl">{emoji}</div>
        <div>
          <h2 className={`text-2xl uppercase ${accent.text}`}>{title}</h2>
          <p className="text-sm text-neutral-600">
            {players.length} / {slotsPerSide} players
          </p>
        </div>
      </div>

      <div className="space-y-2 mb-3">
        {players.length === 0 && (
          <p className="text-sm text-neutral-400">No one here yet</p>
        )}
        {players.map((p) => (
          <div key={p.id} className="flex items-center justify-between text-sm">
            <span className="font-semibold truncate">{p.name}</span>
            <span className="text-xs text-neutral-500 uppercase">Slot {p.slot + 1}</span>
          </div>
        ))}
      </div>

      {isSelected ? (
        <p className="text-sm font-bold uppercase text-amber-700">You're on this team</p>
      ) : isFull ? (
        <p className="text-sm font-bold uppercase text-red-600">Team full</p>
      ) : (
        <p className="text-sm font-bold uppercase text-neutral-700">Tap to switch</p>
      )}
    </button>
  );
}
