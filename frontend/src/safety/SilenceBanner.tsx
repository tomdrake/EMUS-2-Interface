import { useDesign } from "@/app/store";
import { Icon } from "@/layout/Icon";

import { elapsed } from "./status";

/**
 * Shown for the whole time alarm sound is paused. It cannot be turned off in the
 * design: only its position and whether it pulses. It says three things a tired
 * person needs: sound is paused, for how much longer, and that alarms still show.
 */
export function SilenceBanner({ secondsLeft, onResume }: { secondsLeft: number; onResume: () => void }) {
  const design = useDesign()!;
  if (secondsLeft <= 0) return null;
  const s = design.safety;
  return (
    <div className={`silence-banner silence-${s.silence_banner}${s.silence_banner_pulse ? " is-pulsing" : ""}`}
         role="alert" data-testid="silence-banner">
      <Icon id="alarm-off" size={28} />
      <strong className="silence-title">ALARM SOUND PAUSED</strong>
      <span className="silence-count" data-testid="silence-count">{elapsed(secondsLeft * 1000)}</span>
      <span className="silence-note">Alarms still show on screen</span>
      <button type="button" className="btn silence-resume" onClick={onResume} data-testid="silence-resume">
        Resume sound
      </button>
    </div>
  );
}
