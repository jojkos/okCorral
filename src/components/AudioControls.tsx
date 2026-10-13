import { useSyncExternalStore } from 'react';
import {
  getAudioPreferencesSnapshot, getMusicStatus, isMuted, retryMusic,
  setAudioPreferences, setMuted, subscribeAudioPreferences,
  subscribeMusicStatus, WESTERN_TRACK,
} from '../sound';
import './audioPreferences.css';

/** Shared local controls for the lobby settings and in-game speaker popup. */
export default function AudioControls({ showTrackDetails = true }: { showTrackDetails?: boolean }) {
  const audio = useSyncExternalStore(subscribeAudioPreferences, getAudioPreferencesSnapshot, getAudioPreferencesSnapshot);
  const muted = useSyncExternalStore(subscribeAudioPreferences, isMuted, isMuted);
  const musicStatus = useSyncExternalStore(subscribeMusicStatus, getMusicStatus, getMusicStatus);
  return <div className="audio-controls">
    <label className="audio-master"><input type="checkbox" checked={muted} onChange={event => setMuted(event.target.checked)} />Mute all sound</label>
    {(['music', 'effects'] as const).map(kind => {
      const title = kind === 'music' ? 'Music' : 'Sound effects';
      const enabled = audio[`${kind}Enabled`], volume = audio[`${kind}Volume`];
      return <fieldset key={kind} disabled={muted}>
        <legend>{title}</legend>
        <label className="audio-toggle"><input type="checkbox" checked={enabled} onChange={event => setAudioPreferences({ [`${kind}Enabled`]: event.target.checked })} />{title} on</label>
        <div className="audio-level"><input aria-label={`${title} volume`} type="range" min="0" max="100" step="5" value={Math.round(volume * 100)} disabled={!enabled} onChange={event => setAudioPreferences({ [`${kind}Volume`]: Number(event.target.value) / 100 })} /><output>{Math.round(volume * 100)}%</output></div>
        {kind === 'music' && showTrackDetails && <div className="audio-track">
          <strong>{WESTERN_TRACK.title}</strong>
          <span>Western soundtrack · original tempo</span>
          {musicStatus === 'loading' && <span role="status">Loading soundtrack…</span>}
          {musicStatus === 'error' && <span role="alert">Music couldn't load. <button type="button" onClick={retryMusic}>Try again</button></span>}
        </div>}
      </fieldset>;
    })}
  </div>;
}
