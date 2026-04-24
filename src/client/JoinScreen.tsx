import { useState, useEffect } from 'react';
import { WesternBackdrop, WesternBtn, westernStyles as S } from '../components/WesternUI';

interface JoinScreenProps {
  initialCode: string;
  initialName: string;
  error: string | null;
  onJoin: (code: string, name: string) => void;
}

export default function JoinScreen({ initialCode, initialName, error, onJoin }: JoinScreenProps) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState(initialName);

  useEffect(() => { setCode(initialCode); }, [initialCode]);
  useEffect(() => { setName(initialName); }, [initialName]);

  const canJoin = code.length === 4 && name.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canJoin) onJoin(code.toUpperCase(), name.trim());
  };

  const inputBase: React.CSSProperties = {
    width: '100%',
    background: 'rgba(255,248,220,0.6)',
    border: '2px solid #6b4423',
    borderRadius: 4,
    color: '#1a0e08',
    outline: 'none',
  };

  return (
    <WesternBackdrop>
      <form
        onSubmit={handleSubmit}
        style={{ position: 'relative', zIndex: 2, minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: 24, gap: 20 }}
      >
        <div style={{ textAlign: 'center', marginTop: 30 }}>
          <div style={{ fontSize: 72, lineHeight: 1 }}>🤠</div>
          <h1 style={{ ...S.title, fontSize: 36, margin: '12px 0 4px' }}>RIDE IN</h1>
          <div style={{ ...S.serif, color: '#d9cbb0', fontSize: 16, opacity: 0.9 }}>Stake yer claim on a slot</div>
        </div>

        <div style={{ ...S.paper, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <label>
            <div style={{ ...S.mono, fontSize: 10, letterSpacing: 2, color: '#6b4423', fontWeight: 'bold', marginBottom: 6 }}>
              YER NAME
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Billy the Kid"
              maxLength={20}
              style={{
                ...inputBase,
                padding: '14px',
                ...S.serif,
                fontSize: 20,
                letterSpacing: 1,
              }}
            />
          </label>
          <label>
            <div style={{ ...S.mono, fontSize: 10, letterSpacing: 2, color: '#6b4423', fontWeight: 'bold', marginBottom: 6 }}>
              ROOM CODE
            </div>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
              placeholder="ABCD"
              maxLength={4}
              style={{
                ...inputBase,
                padding: '20px 14px',
                ...S.title,
                fontSize: 44,
                color: '#3e2417',
                letterSpacing: 14,
                textAlign: 'center',
              }}
            />
          </label>
        </div>

        {error && (
          <div
            style={{
              ...S.mono,
              padding: '12px 16px',
              background: 'rgba(181,58,58,0.15)',
              border: '2px solid #b53a3a',
              borderRadius: 4,
              color: '#ff8080',
              textAlign: 'center',
              fontWeight: 'bold',
            }}
          >
            ⚠ {error}
          </div>
        )}

        <div style={{ flex: 1 }} />

        <WesternBtn primary big type="submit" disabled={!canJoin}>▶ ENTER SALOON</WesternBtn>
        <div style={{ ...S.mono, fontSize: 10, color: '#d9cbb0', textAlign: 'center', opacity: 0.6, letterSpacing: 2 }}>
          OR SCAN THE HOST'S POSTER
        </div>
      </form>
    </WesternBackdrop>
  );
}
