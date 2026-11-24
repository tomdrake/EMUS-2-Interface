/**
 * The priority of a patient alarm, in shape as well as colour. A high priority (emergency) alarm is a red
 * triangle with an exclamation mark in it; medium and low keep their short marks ("!!" and "!"). The mark's text
 * ("!!!") stays in the data and is what a screen reader hears, as "High priority".
 */
export function PriorityMark({ priority, mark, testId }: { priority: string; mark: string; testId?: string }) {
  if (priority === "high") {
    return (
      <span className="notif-mark mark-high" data-testid={testId} data-mark={mark} role="img" aria-label="High priority">
        <svg className="priority-triangle" width="18" height="16" viewBox="0 0 24 21" aria-hidden="true" focusable="false">
          <path d="M12 1.6 22.6 19.4H1.4z" className="prio-body" />
          <rect x="10.7" y="7.2" width="2.6" height="6.6" rx="1.2" className="prio-bang" />
          <circle cx="12" cy="16.4" r="1.5" className="prio-bang" />
        </svg>
      </span>
    );
  }
  return <span className={`notif-mark mark-${priority}`} data-testid={testId} data-mark={mark}>{mark}</span>;
}
