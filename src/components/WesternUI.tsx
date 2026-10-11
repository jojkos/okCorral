import type { CSSProperties, ReactNode } from 'react';
import type { Team } from '../../shared/types';

export const westernStyles = {
  paper: {
    background: 'linear-gradient(145deg, #ead8b4 0%, #d4bf93 100%)',
    boxShadow: '0 4px 0 rgba(40,20,8,0.35), inset 0 0 60px rgba(120,80,30,0.18), inset 0 2px 0 rgba(255,240,210,0.6)',
    border: '2px solid #3e2417',
    borderRadius: 6,
    color: '#2a1a0e',
  } as CSSProperties,
  wood: {
    background: 'linear-gradient(150deg, #263c45 0%, #172a33 100%)',
    border: '1px solid #81948b55',
    borderRadius: 6,
    boxShadow: 'inset 0 1px 0 rgba(255,200,150,0.1), 0 6px 20px rgba(0,0,0,0.5)',
  } as CSSProperties,
  title: {
    fontFamily: "'Rye', serif",
    color: '#e0b04a',
    textShadow: '0 2px 0 rgba(0,0,0,0.6), 0 4px 20px rgba(224,176,74,0.3)',
    letterSpacing: 3,
  } as CSSProperties,
  serif: { fontFamily: "'Rye', serif" } as CSSProperties,
  mono: { fontFamily: "'Space Mono', monospace" } as CSSProperties,
};

export function WesternBackdrop({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <div
      className="frontier-backdrop"
      style={{
        position: 'relative',
        width: '100%',
        minHeight: '100vh',
        background: dark
          ? 'radial-gradient(ellipse at 50% 45%, #2b4149 0%, #1a0e08 60%, #0a0604 100%)'
          : 'radial-gradient(ellipse at 50% 40%, #6b4423 0%, #2b4149 50%, #1a0e08 100%)',
        overflow: 'hidden',
      }}
    >
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, opacity: 0.25, mixBlendMode: 'multiply', pointerEvents: 'none' }}>
        <defs>
          <pattern id="wu-planks" x="0" y="0" width="200" height="80" patternUnits="userSpaceOnUse">
            <rect width="200" height="80" fill="#2b4149" />
            <line x1="0" y1="0" x2="200" y2="0" stroke="#1a0e08" strokeWidth="2" />
            <line x1="0" y1="80" x2="200" y2="80" stroke="#1a0e08" strokeWidth="2" />
            <line x1="70" y1="0" x2="80" y2="80" stroke="#0a0604" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#wu-planks)" />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 50% 30%, rgba(255,210,130,0.15) 0%, transparent 60%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.6) 100%)',
          pointerEvents: 'none',
        }}
      />
      {children}
    </div>
  );
}

export function StarEmblem({ size = 48, color = '#ffd875' }: { size?: number; color?: string }) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? size / 2 : size / 4;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    pts.push(`${size / 2 + Math.cos(a) * r},${size / 2 + Math.sin(a) * r}`);
  }
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <polygon points={pts.join(' ')} fill={color} stroke="rgba(0,0,0,0.5)" strokeWidth="1" />
      <circle cx={size / 2} cy={size / 2} r={size / 8} fill="rgba(0,0,0,0.25)" />
    </svg>
  );
}

export function SkullEmblem({ size = 48, color = '#f4e9d6' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48">
      <path
        d="M 24 4 C 12 4, 6 14, 6 24 C 6 30, 10 34, 12 36 L 12 42 L 18 42 L 18 38 L 22 38 L 22 42 L 26 42 L 26 38 L 30 42 L 36 42 L 36 36 C 38 34, 42 30, 42 24 C 42 14, 36 4, 24 4 Z"
        fill={color}
        stroke="rgba(0,0,0,0.6)"
        strokeWidth="1"
      />
      <circle cx="16" cy="22" r="4" fill="#1a0e08" />
      <circle cx="32" cy="22" r="4" fill="#1a0e08" />
      <path d="M 22 30 L 22 34 L 26 34 L 26 30 Z" fill="#1a0e08" />
    </svg>
  );
}

export function MiniCowboy({ team, size = 32 }: { team: Team; size?: number }) {
  const isSheriff = team === 'sheriffs';
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <path d="M10 11 Q8 13 10 16 L11 17 Q12 21 17 21 Q21 20 21 17 L23 16 L21 14 L21 10Z" fill="#d9a87c" />
      <path d="M10 10 L13 10 L12 17 L10 16Z" fill={isSheriff ? '#71472f' : '#3d3431'} />
      <path d="M17 13 L20 13.5 M13 13 L14 13" stroke="#694630" strokeWidth=".8" strokeLinecap="round" />
      <circle cx="19" cy="14.5" r=".65" fill="#3a3430" />
      <path d={isSheriff ? 'M17 17 Q15 16 13 18 Q16 19 17 18 Q19 19 21 18 Q19 16 17 17' : 'M12 17 Q16 19 21 17 L20 20 Q17 23 13 20Z'} fill={isSheriff ? '#6b472f' : '#3b3431'} />
      <path d="M5 9 Q16 5 27 9 Q29 12 16 12 Q3 11 5 9" fill={isSheriff ? '#bb9460' : '#45444b'} />
      <path d="M10 9 L11 3 Q13 1 16 4 Q20 1 21 4 L23 9Z" fill={isSheriff ? '#bb9460' : '#45444b'} />
      <path d="M11 3 L14 3 L14 9 L10 9Z" fill={isSheriff ? '#896840' : '#2b3339'} />
      <path d="M10.5 8 Q16 9 22 8" stroke={isSheriff ? '#6c4f36' : '#a9674c'} strokeWidth="1.8" />
      <path d="M6 10 Q16 13 27 10" fill="none" stroke={isSheriff ? '#ead1a2' : '#bda892'} strokeWidth=".6" />
      <path d="M6 30 L7 24 Q9 22 12 22 L20 22 Q24 22 25 25 L26 30Z" fill={isSheriff ? '#549d9d' : '#b86248'} />
      <path d="M13 23 L19 23 L20 30 L13 30Z" fill="#e5d2ae" />
      <path d="M11 22 L14 21 L16 25 L12 26Z M19 21 L22 23 L19 26 L17 24Z" fill={isSheriff ? '#a6ddd2' : '#f0b398'} />
      {isSheriff ? (
        <polygon points="10,26 12,25 13,27 11,28" fill="#ffd875" />
      ) : (
        <g stroke="#f4e9d6" strokeWidth="1.2">
          <line x1="10" y1="25" x2="13" y2="28" />
          <line x1="13" y1="25" x2="10" y2="28" />
        </g>
      )}
    </svg>
  );
}

export function WesternBtn({
  children,
  primary,
  big,
  disabled,
  type = 'button',
  onClick,
  className,
}: {
  children: ReactNode;
  primary?: boolean;
  big?: boolean;
  disabled?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={className}
      style={{
        fontFamily: "'Space Mono', monospace",
        fontWeight: 'bold',
        padding: big ? '14px 28px' : '10px 20px',
        fontSize: big ? 15 : 12,
        letterSpacing: 2,
        textTransform: 'uppercase',
        background: disabled
          ? 'linear-gradient(180deg, #2b4149aa 0%, #182c35aa 100%)'
          : primary
            ? 'linear-gradient(180deg, #e0b04a 0%, #8a621e 100%)'
            : 'linear-gradient(180deg, #2b4149 0%, #182c35 100%)',
        color: disabled ? '#6b4423' : primary ? '#1a0e08' : '#f4e9d6',
        border: `2px solid ${primary ? '#ffd875' : '#6b4423'}`,
        borderRadius: 4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        boxShadow: disabled
          ? 'none'
          : primary
            ? '0 4px 0 #5a3a10, inset 0 1px 0 rgba(255,255,255,0.3)'
            : '0 3px 0 rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,200,150,0.1)',
      }}
    >
      {children}
    </button>
  );
}
