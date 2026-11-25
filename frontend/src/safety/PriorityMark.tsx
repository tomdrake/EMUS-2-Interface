/**
 * Priority and urgency in shape and word, never in repeated exclamation marks: a red triangle with "!" for high priority
 * (and Urgent, Critical), an amber outlined triangle for medium, a circled "!" for low (and Check). The word always sits
 * beside it, and a screen reader hears "High priority".
 */
export type Level = "high" | "medium" | "low";

export function AlertGlyph({ level, size = 18 }: { level: Level; size?: number }) {
  if (level === "low") {
    return (
      <svg className="alert-circle" width={size * 0.8} height={size * 0.8} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="10" className="prio-ring" />
        <rect x="10.7" y="5.6" width="2.6" height="8" rx="1.2" className="prio-bang" />
        <circle cx="12" cy="17.6" r="1.6" className="prio-bang" />
      </svg>
    );
  }
  return (
    <svg className={`priority-triangle${level === "medium" ? " is-medium" : ""}`} width={size} height={size * 16 / 18} viewBox="0 0 24 21" aria-hidden="true" focusable="false">
      <path d="M12 1.6 22.6 19.4H1.4z" className="prio-body" />
      <rect x="10.7" y="7.2" width="2.6" height="6.6" rx="1.2" className="prio-bang" />
      <circle cx="12" cy="16.4" r="1.5" className="prio-bang" />
    </svg>
  );
}

export function PriorityMark({ priority, mark, testId }: { priority: string; mark: string; testId?: string }) {
  const level = (priority === "high" || priority === "medium" ? priority : "low") as Level;
  const word = `${priority.charAt(0).toUpperCase()}${priority.slice(1)} priority`;
  return (
    <span className={`notif-mark mark-${priority}`} data-testid={testId} data-mark={mark} role="img" aria-label={word}>
      <AlertGlyph level={level} />
    </span>
  );
}
