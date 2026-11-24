import { useEffect, useRef, useState } from "react";

import { useSilenceActions, useSilenceRemaining } from "@/alarms/SilenceButton";
import { useDesign, useUi } from "@/app/store";
import { label } from "@/design/text";
import { Icon } from "@/layout/Icon";
import { useSize } from "@/traces/useSize";

import { buildNotices, noticeColour, type Notice } from "./notifications";
import { ago, elapsed } from "./status";
import { useSafety } from "./store";
import { marqueeSeconds, noticeKey, tickerView } from "./ticker";

function useNotices(): Notice[] {
  const design = useDesign()!;
  const registry = useUi((s) => s.registry)!;
  const link = useSafety((s) => s.link);
  const sound = useSafety((s) => s.sound);
  const alarms = useSafety((s) => s.alarms);
  const devices = useSafety((s) => s.devices);
  const enableSound = useSafety((s) => s.enableSound);
  return buildNotices({ link, sound, alarms, devices, registry, order: design.notifications.order,
                        enableSound: enableSound ? () => void enableSound() : undefined });
}

const TAG = { patient: "PATIENT", monitor: "MONITOR" } as const;

/** One notification: a tag, the priority mark for patient alarms, and the text in its row's colour. */
function Item({ n, inline = false }: { n: Notice; inline?: boolean }) {
  const design = useDesign()!;
  const { colour, dots } = noticeColour(n.parameters, design.rows);
  return (
    <span className={`ticker-item${inline ? " ticker-inline" : ""} item-${n.about}-${n.priority}`}
          data-notice={n.id} style={colour ? { color: colour } : undefined}>
      <span className="notif-meta">
        <span className="notif-tag">{TAG[n.about]}</span>
        {n.mark && <span className={`notif-mark mark-${n.priority}`} data-testid="notif-mark">{n.mark}</span>}
        {dots.map((c, i) => <span key={i} className="notif-dot" style={{ background: c }} aria-hidden="true" />)}
      </span>
      <span className="notif-text" data-testid={inline ? undefined : "notif-text"}>{n.text}</span>
    </span>
  );
}

/**
 * The notification ticker. Always on screen, always the same size.
 *
 * With nothing to report it says "No Notifications". Otherwise it takes the items
 * in turn, most serious first: rolling up one at a time (vertical) or scrolling
 * sideways when the text does not fit (horizontal). A high-priority PATIENT alarm
 * stops it and is held still until it clears (see ticker.ts).
 *
 * Touching it opens the full list. The list never opens by itself, whatever
 * arrives. The ticker pauses while the list is open. Whatever arrives, the box and
 * everything around it keep their dimensions.
 *
 * While alarm sound is paused the box also carries a yellow SOUND PAUSED mark with
 * the time left. A new notification is announced once to screen readers; the
 * rotation itself is not (aria-live is off on the ticker).
 */
export function NotificationBox({ placement }: { placement: "bar" | "strip" }) {
  const design = useDesign()!;
  const cfg = design.notifications;
  const notices = useNotices();
  const pausedFor = useSilenceRemaining();
  const { resume } = useSilenceActions();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [tick, setTick] = useState(0);
  const [announce, setAnnounce] = useState("");
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  // Start again at the top whenever the set of items changes.
  const key = noticeKey(notices);
  useEffect(() => setTick(0), [key]);

  const view = tickerView(notices, tick);
  const horizontal = cfg.ticker === "horizontal";
  const rotating = !horizontal && view.total > 1 && !view.held && !open;
  useEffect(() => {
    if (!rotating) return;
    const id = window.setInterval(() => setTick((t) => t + 1), cfg.ticker_dwell_s * 1000);
    return () => window.clearInterval(id);
  }, [rotating, cfg.ticker_dwell_s, key]);

  // Say a NEW notification once, to screen readers. Not each turn of the ticker.
  useEffect(() => {
    const ids = new Set(notices.map((n) => n.id));
    const fresh = seen.current ? notices.filter((n) => !seen.current!.has(n.id)) : [];
    seen.current = ids;
    if (fresh.length) setAnnounce(fresh[0]!.text);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!announce) return;
    const id = window.setTimeout(() => setAnnounce(""), 6000);
    return () => window.clearTimeout(id);
  }, [announce]);

  // Horizontal: scroll only if the text does not fit.
  const [viewportRef, viewport] = useSize<HTMLSpanElement>();
  const trackRef = useRef<HTMLSpanElement>(null);
  const [trackW, setTrackW] = useState(0);
  const items = horizontal ? (view.held ? [view.current!] : notices) : [];
  useEffect(() => {
    setTrackW(trackRef.current?.scrollWidth ?? 0);
  }, [key, horizontal, view.held, viewport.w, cfg.size]);
  const scrolling = horizontal && !view.held && items.length > 0 && trackW > viewport.w + 1;
  const chars = items.reduce((sum, n) => sum + n.text.length + 14, 0);

  const top = view.current;
  const tone = top ? (top.about === "patient" ? `patient-${top.priority}` : "monitor") : "empty";
  const above = cfg.position === "tab-bar-left" || cfg.position === "tab-bar-right"
    || cfg.position === "strip-above-tabs";
  const side = cfg.position === "tab-bar-right" ? "right" : "left";

  return (
    <>
      <button type="button" data-testid="notifications" aria-expanded={open}
              aria-label={top ? `${notices.length} notifications. Most important: ${notices[0]!.text}` : cfg.empty_text}
              data-held={view.held} data-ticker={cfg.ticker}
              className={`notif notif-${placement} notif-size-${cfg.size} notif-${tone}${cfg.flash ? " can-flash" : ""}${pausedFor > 0 ? " is-paused" : ""}`}
              onClick={() => setOpen((v) => !v)}>
        <Icon id="bell" size={22} />
        <span className={`ticker ticker-${cfg.ticker}`} aria-live="off">
          {!top ? (
            <span className="ticker-none" data-testid="notif-text">{label(cfg.empty_text, design)}</span>
          ) : horizontal ? (
            <span className="ticker-viewport" ref={viewportRef}>
              <span ref={trackRef} data-testid="notif-text"
                    className={`ticker-track${scrolling ? " is-scrolling" : ""}`}
                    style={{ "--marquee-s": `${marqueeSeconds(chars, cfg.ticker_speed)}s` } as React.CSSProperties}>
                {items.map((n) => <Item key={n.id} n={n} inline />)}
                {scrolling && items.map((n) => <span key={`${n.id}-again`} aria-hidden="true"><Item n={n} inline /></span>)}
              </span>
            </span>
          ) : (
            <span key={`${top.id}:${view.held ? "held" : tick}`} className="ticker-roll">
              <Item n={top} />
            </span>
          )}
        </span>
        {cfg.show_count && view.total > 1 && (
          <span className="notif-count" data-testid="notif-count">{view.position}/{view.total}</span>
        )}
        {pausedFor > 0 && (
          <span className="notif-paused" data-testid="notif-paused">
            SOUND PAUSED <strong>{elapsed(pausedFor * 1000)}</strong>
          </span>
        )}
      </button>
      <span className="sr-only" role="alert" data-testid="notif-announce">{announce}</span>

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
              {notices.slice(0, cfg.feed_max_items).map((n) => {
                const { colour, dots } = noticeColour(n.parameters, design.rows);
                return (
                  <li key={n.id} className={`feed-item feed-${n.about}-${n.priority}`} data-notice={n.id}
                      style={colour ? { color: colour } : undefined}>
                    <span className="feed-tag">{TAG[n.about]}</span>
                    {n.mark && <span className={`notif-mark mark-${n.priority}`}>{n.mark}</span>}
                    {dots.map((c, i) => <span key={i} className="notif-dot" style={{ background: c }} aria-hidden="true" />)}
                    <span className="feed-text">{n.text}</span>
                    {n.at !== null && <span className="feed-age">{ago(now - n.at)}</span>}
                    {n.action && <button type="button" className="btn" onClick={n.action.run}>{n.action.label}</button>}
                  </li>
                );
              })}
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
