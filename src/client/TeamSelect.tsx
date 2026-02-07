import type { ClientPlayer, GameState, Team, Player } from '../../shared/types';
import { socket } from '../socket';
import { WesternButton } from '../components/WesternButton';
import { cn } from './lib/utils';
import { Star, Skull } from 'lucide-react';

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
    <div className="min-h-screen flex flex-col p-4 md:p-6 bg-background">
      <div className="text-center mb-6 relative py-4">
        <button
          className="absolute right-0 top-0 text-xs uppercase font-bold text-muted-foreground hover:text-foreground"
          onClick={onLeave}
        >
          Leave
        </button>
        <h1 className="text-3xl md:text-4xl uppercase text-primary font-display">Pick a Side</h1>
        <p className="text-muted-foreground">
          Welcome, <strong className="text-foreground">{player.name}</strong>!
        </p>
      </div>

      {error && (
        <div className="text-destructive text-center py-2 px-4 mb-4 bg-destructive/10 border-2 border-destructive/30 rounded-lg font-bold animate-shake">
          {error}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 gap-4">
        <TeamPanel
          title="Sheriffs"
          icon={<Star className="w-8 h-8 md:w-10 md:h-10 fill-current" />}
          team="sheriffs"
          isSelected={isSheriff}
          slotsPerSide={config.slotsPerSide}
          players={sheriffs}
          available={sheriffsAvailable}
          onSelect={onSelectTeam}
        />
        <TeamPanel
          title="Outlaws"
          icon={<Skull className="w-8 h-8 md:w-10 md:h-10" />}
          team="outlaws"
          isSelected={isOutlaw}
          slotsPerSide={config.slotsPerSide}
          players={outlaws}
          available={outlawsAvailable}
          onSelect={onSelectTeam}
        />
      </div>

      {unassigned.length > 0 && (
        <div className="western-card p-3 mt-4 bg-muted/30">
          <div className="text-xs uppercase text-muted-foreground font-bold mb-2">Undecided</div>
          <div className="flex flex-wrap gap-2">
            {unassigned.map(p => (
              <span key={p.id} className="bg-secondary px-3 py-1 rounded-full text-sm font-semibold border border-border">
                🤠 {p.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 sticky bottom-4">
        {canStartGame ? (
          <WesternButton
            variant="primary"
            className="w-full py-6 text-xl shadow-xl bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={() => socket.emit('startGame')}
          >
            🎮 Start Gunfight!
          </WesternButton>
        ) : (
          <div className="text-center text-muted-foreground bg-background/80 backdrop-blur p-2 rounded-lg border border-border">
            Waiting for players on both sides...
          </div>
        )}
      </div>
    </div>
  );
}

interface TeamPanelProps {
  title: string;
  icon: React.ReactNode;
  team: Team;
  isSelected: boolean;
  slotsPerSide: number;
  players: Player[];
  available: number;
  onSelect: (team: Team) => void;
}

function TeamPanel({
  title,
  icon,
  team,
  isSelected,
  slotsPerSide,
  players,
  available,
  onSelect,
}: TeamPanelProps) {
  const isFull = available <= 0;
  const isDisabled = (isFull && !isSelected) || isSelected;
  
  // Dynamic styles based on team
  const isSheriffTeam = team === 'sheriffs';
  const borderColor = isSheriffTeam ? 'border-blue-600' : 'border-red-600';
  const bgColor = isSheriffTeam ? 'bg-blue-50' : 'bg-red-50';
  const textColor = isSheriffTeam ? 'text-blue-800' : 'text-red-800';
  const ringColor = isSheriffTeam ? 'ring-blue-500' : 'ring-red-500';

  return (
    <button
      className={cn(
        "western-card p-4 md:p-6 text-left transition-all active:scale-[0.98] relative overflow-hidden group",
        borderColor,
        bgColor,
        isSelected && `ring-4 ${ringColor} ring-offset-2 ring-offset-background`
      )}
      onClick={() => {
        if (!isSelected) onSelect(team);
      }}
      disabled={isDisabled}
    >
      <div className="flex items-center gap-4 mb-3">
        <div className="text-4xl filter drop-shadow-sm group-hover:scale-110 transition-transform">{icon}</div>
        <div>
          <h2 className={cn("text-2xl uppercase font-display", textColor)}>{title}</h2>
          <p className="text-sm text-neutral-600 font-mono">
            {players.length} / {slotsPerSide} slots
          </p>
        </div>
      </div>

      <div className="space-y-2 mb-3 min-h-[60px]">
        {players.length === 0 && (
          <p className="text-sm text-neutral-400 italic">No one here yet</p>
        )}
        {players.map((p) => (
          <div key={p.id} className="flex items-center justify-between text-sm bg-white/50 p-1.5 rounded border border-black/5">
            <span className="font-semibold truncate">{p.name}</span>
            <span className="text-xs text-neutral-500 uppercase font-mono">Slot {p.slot + 1}</span>
          </div>
        ))}
      </div>

      <div className="pt-2 border-t border-black/10">
      {isSelected ? (
        <p className="text-sm font-bold uppercase text-primary flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
          Current Team
        </p>
      ) : isFull ? (
        <p className="text-sm font-bold uppercase text-destructive">Team Full</p>
      ) : (
        <p className="text-sm font-bold uppercase text-muted-foreground group-hover:text-foreground transition-colors">
          Tap to Join
        </p>
      )}
      </div>
    </button>
  );
}
