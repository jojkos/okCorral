import { useState, useEffect } from 'react';
import { WesternButton } from '../components/WesternButton';

interface JoinScreenProps {
  initialCode: string;
  initialName: string;
  error: string | null;
  onJoin: (code: string, name: string) => void;
}

export default function JoinScreen({ initialCode, initialName, error, onJoin }: JoinScreenProps) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState(initialName);

  useEffect(() => {
    setCode(initialCode);
  }, [initialCode]);

  useEffect(() => {
    setName(initialName);
  }, [initialName]);

  const canJoin = code.length === 4 && name.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canJoin) {
      onJoin(code.toUpperCase(), name.trim());
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg text-center">
        <div className="mx-auto w-14 h-14 rounded-full border-2 border-amber-700 flex items-center justify-center text-2xl mb-4">
          💀
        </div>
        <h1 className="text-4xl uppercase text-amber-700">Join Posse</h1>
        <p className="text-neutral-500 mt-2">Enter the saloon code</p>

        <div className="western-card mt-8 p-6 md:p-8 text-left">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="player-name" className="block text-sm font-bold mb-2 uppercase text-neutral-600">
                Your Name
              </label>
              <input
                id="player-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 20))}
                placeholder="Cowboy Joe"
                className="w-full text-left text-lg py-3 px-4
                  bg-amber-50 border-2 border-amber-800 rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-amber-500"
                autoFocus={!initialCode}
              />
            </div>

            <div>
              <label htmlFor="room-code" className="block text-sm font-bold mb-2 uppercase text-neutral-600">
                Room Code
              </label>
              <input
                id="room-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
                placeholder="B5HW"
                className="w-full text-center text-3xl tracking-[0.5em] py-4
                  bg-amber-50 border-2 border-amber-800 rounded-lg
                  focus:outline-none focus:ring-2 focus:ring-amber-500"
                style={{ fontFamily: 'Space Mono, monospace' }}
              />
            </div>

            {error && (
              <div className="text-red-700 text-center py-2 px-4 bg-red-100 border-2 border-red-300 rounded-lg font-bold">
                {error}
              </div>
            )}

            <WesternButton
              type="submit"
              disabled={!canJoin}
              variant="primary"
              size="lg"
              className="w-full"
            >
              Enter Saloon
            </WesternButton>
          </form>
        </div>
      </div>
    </div>
  );
}
