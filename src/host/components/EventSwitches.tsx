import { CloudRain, Crosshair, UserRound, Wind } from 'lucide-react';
import type { RandomEventSettings } from '../../../shared/types';

const EVENTS = [
  { key: 'strongWind', name: 'Wind', detail: 'Curved shots & drifting bodies', icon: Wind },
  { key: 'walkingWoman', name: 'Civilian', detail: 'A bystander crosses the street', icon: UserRound },
  { key: 'gatlingMan', name: 'Gatling', detail: 'A gunman with an eight-shot burst', icon: Crosshair },
  { key: 'rain', name: 'Rain & swallows', detail: 'Birds warn of rain · lose 1 bullet', icon: CloudRain },
] as const;

export default function EventSwitches({ settings, disabled, onToggle }: {
  settings: RandomEventSettings;
  disabled: boolean;
  onToggle: (event: keyof RandomEventSettings, enabled: boolean) => void;
}) {
  const count = Object.values(settings).filter(Boolean).length;
  return <section className="hl-events" aria-labelledby="hl-events-title">
    <div className="hl-events__head">
      <h2 id="hl-events-title">Random events</h2>
      <span>{count ? `${count} / 4 enabled` : 'All off · pure shootout'} · saved automatically</span>
    </div>
    <div className="hl-events__grid">
      {EVENTS.map(({ key, name, detail, icon: Icon }) => <button key={key} type="button" role="switch"
        aria-checked={settings[key]} aria-label={name} aria-describedby={`event-${key}-detail`}
        disabled={disabled} onClick={() => onToggle(key, !settings[key])}
        className={`hl-event ${settings[key] ? 'hl-event--on' : ''}`}>
        <Icon className="hl-event__icon" aria-hidden="true" />
        <span className="hl-event__copy"><strong>{name}</strong><small id={`event-${key}-detail`}>{detail}</small></span>
        <span className="hl-event__state" aria-hidden="true"><i /><b>{settings[key] ? 'ON' : 'OFF'}</b></span>
      </button>)}
    </div>
  </section>;
}
