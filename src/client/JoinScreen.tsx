import { useState, useEffect } from 'react';
import { WesternButton } from '../components/WesternButton';
import { Skull } from 'lucide-react';

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
    <div className="min-h-screen bg-background flex flex-col p-4">
      <main className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto w-full">
         <div className="w-full animate-slide-in">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 border-2 border-primary">
              <Skull className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-4xl font-display text-primary">Join Game</h1>
            <p className="text-muted-foreground mt-2">Enter the saloon code</p>
          </div>

          <div className="western-card p-6 md:p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              
              <div className="space-y-2">
                <label htmlFor="name" className="text-lg font-display">Your Name</label>
                <input 
                  id="name"
                  placeholder="Billy the Kid" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex h-10 w-full rounded-md border-input px-3 ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 text-lg py-6 bg-white/50 border-2 border-[#8B5E3C]/30 focus-visible:ring-primary font-mono"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="code" className="text-lg font-display">Room Code</label>
                <input 
                  id="code"
                  placeholder="ABCD" 
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  maxLength={4}
                  className="flex h-10 w-full rounded-md border-input px-3 ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 text-4xl text-center py-8 tracking-[0.5em] font-black uppercase bg-white/50 border-2 border-[#8B5E3C]/30 focus-visible:ring-primary font-mono placeholder:tracking-normal placeholder:text-2xl"
                />
              </div>

              {error && (
                <div className="text-destructive text-center py-2 px-4 bg-destructive/10 border-2 border-destructive/30 rounded-lg font-bold animate-shake">
                  {error}
                </div>
              )}

              <WesternButton 
                type="submit" 
                className="w-full text-xl py-6 mt-4"
                disabled={!canJoin}
              >
                Enter Saloon
              </WesternButton>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
