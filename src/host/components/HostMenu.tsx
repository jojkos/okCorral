import { useState } from 'react';
import { Menu, Square, X } from 'lucide-react';
import type { GamePhase } from '../../../shared/types';
import { socket } from '../../socket';

export const HOST_SESSION_KEY = 'okCorral-hostSession';

/** Leaves the room for good: tells the server to close it (phones are sent home) and forgets it locally. */
export function closeRoom() {
  socket.emit('endSession');
  sessionStorage.removeItem(HOST_SESSION_KEY);
  window.location.href = '/';
}

// Small host-only menu in the bottom-left corner of the TV.
export default function HostMenu({ phase }: { phase: GamePhase | undefined }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<'end' | 'close' | null>(null);
  const inMatch = phase === 'planning' || phase === 'resolution';

  const act = (what: 'end' | 'close') => {
    if (confirm !== what) { setConfirm(what); return; }
    setOpen(false); setConfirm(null);
    if (what === 'end') socket.emit('playAgain');
    else closeRoom();
  };

  return (
    <div className="host-menu">
      {open && (
        <div className="host-menu__panel" role="menu">
          {inMatch && (
            <button role="menuitem" className={confirm === 'end' ? 'confirm' : ''} onClick={() => act('end')}>
              <Square size={16} /> {confirm === 'end' ? 'Tap again to end the match' : 'End match → back to lobby'}
            </button>
          )}
          <button role="menuitem" className={`danger ${confirm === 'close' ? 'confirm' : ''}`} onClick={() => act('close')}>
            <X size={16} /> {confirm === 'close' ? 'Tap again to close the room' : 'Close room for everyone'}
          </button>
        </div>
      )}
      <button
        className="host-menu__toggle"
        aria-expanded={open}
        aria-label="Host menu"
        onClick={() => { setOpen(!open); setConfirm(null); }}
      >
        <Menu size={18} /> <span>Host</span>
      </button>
    </div>
  );
}
