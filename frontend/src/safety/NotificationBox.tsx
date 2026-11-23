import { useEffect, useState } from "react";

import { useSilenceActions, useSilenceRemaining } from "@/alarms/SilenceButton";
import { useDesign, useUi } from "@/app/store";
import { label } from "@/design/text";
import { Icon } from "@/layout/Icon";

import { buildNotices, type Notice } from "./notifications";
import { ago, elapsed } from "./status";
import { useSafety } from "./store";

function useNotices(): Notice[] {
  const design = useDesign()!;
  const registry = useUi((s) => s.registry)!;
  const link = useSafety((s) => s.link);
  const sound = useSafety((s) => s.sound);
  const alarms = useSafety((s) => s.alarms);
  const enableSound = useSafety((s) => s.enableSound);
  return buildNotices({ link, sound, alarms, registry, order: design.notifications.order,
                        enableSound: enableSound ? () => void enableSound() : undefined });
}

const TAG = { patient: "PATIENT", monitor: "MONITOR" } as const;

/**
 * The notification box. Always on screen, always the same size.
 *
 * It shows "No Notifications", or the most important item and how many more there
 * are. Touching it opens the full list as an overlay. Whatever arrives, the box
 * and everything around it keep their dimensions: a notification never moves or
 * resizes the monitor.
 *
 * While alarm sound is paused the box also carries a yellow PAUSED chip with the
 * time left, alongside whatever its headline is.
 */
export function NotificationBox({ placement }: { placement: "bar" | "strip" }) {
  const design = useDesign()!;
  const cfg = design.notifications;
  const notices = useNotices();
  const pausedFor = useSilenceRemaining();
  const { resume } = useSilenceActions();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  const top = notices[0];
  const more = notices.length - 1;
  const tone = top ? `${top.about}-${top.priority}` : "empty";
  const above = cfg.position === "tab-bar-left" || cfg.position === "tab-bar-right"
    || cfg.position === "strip-above-tabs";
  const side = cfg.position === "tab-bar-right" ? "right" : "left";

  return (
    <>
      <button type="button" data-testid="notifications" aria-expanded={open}
              aria-label={top ? `${notices.length} notifications. Most important: ${top.text}` : cfg.empty_text}
              className={`notif notif-${placement} notif-size-${cfg.size} notif-${tone}${cfg.flash ? " can-flash" : ""}${pausedFor > 0 ? " is-paused" : ""}`}
              onClick={() => setOpen((v) => !v)}>
        <Icon id="bell" size={22} />
        {top ? (
          <span className="notif-main">
            <span className="notif-tag">{TAG[top.about]}</span>
            <span className="notif-text" data-testid="notif-text">{top.text}</span>
          </span>
        ) : (
          <span className="notif-main notif-none" data-testid="notif-text">{label(cfg.empty_text, design)}</span>
        )}
        {cfg.show_count && more > 0 && <span className="notif-count" data-testid="notif-count">+{more}</span>}
        {pausedFor > 0 && (
          <span className="notif-paused" data-testid="notif-paused">
            SOUND PAUSED <strong>{elapsed(pausedFor * 1000)}</strong>
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="scrim scrim-clear" onClick={() => setOpen(false)} />
          <section className={`feed feed-${above ? "above" : "below"} feed-${side}`} role="dialog"
                   aria-label="Notifications" data-testid="feed">
            <header className="feed-head">
              <h2>{label("Notifications", design)}</h2>
              <button type="button" className="btn" onClick={() => setOpen(false)} data-testid="feed-close">
                {label("Close", design)}
              </button>
            </header>
            <ol className="feed-list">
              {pausedFor > 0 && (
                <li className="feed-item feed-paused" data-testid="feed-paused">
                  <span className="feed-tag">SOUND</span>
                  <span className="feed-text">Alarm sound paused for {elapsed(pausedFor * 1000)}. Alarms still show on screen.</span>
                  <button type="button" className="btn" onClick={resume} data-testid="feed-resume">
                    {label("Resume Sound", design)}
                  </button>
                </li>
              )}
              {notices.slice(0, cfg.feed_max_items).map((n) => (
                <li key={n.id} className={`feed-item feed-${n.about}-${n.priority}`} data-notice={n.id}>
                  <span className="feed-tag">{TAG[n.about]}</span>
                  <span className="feed-text">{n.text}</span>
                  {n.at !== null && <span className="feed-age">{ago(now - n.at)}</span>}
                  {n.action && <button type="button" className="btn" onClick={n.action.run}>{n.action.label}</button>}
                </li>
              ))}
              {!notices.length && pausedFor <= 0 && (
                <li className="feed-item feed-none">{label(cfg.empty_text, design)}</li>
              )}
              {notices.length > cfg.feed_max_items && (
                <li className="feed-item feed-none">{notices.length - cfg.feed_max_items} more not shown</li>
              )}
            </ol>
          </section>
        </>
      )}
    </>
  );
}
