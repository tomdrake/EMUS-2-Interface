/** Stand-in body for a widget that a later milestone implements. */
export function Placeholder({ name, milestone, children }:
  { name: string; milestone: string; children?: React.ReactNode }) {
  return (
    <div className="placeholder" data-placeholder={milestone}>
      <div className="placeholder-name">{name}</div>
      <div className="placeholder-note">Built in milestone {milestone}</div>
      {children}
    </div>
  );
}
