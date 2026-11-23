import { useUi } from "@/app/store";
import { SHEETS } from "@/studio";

/** A built-in panel over the current screen (alarm limits, oxygen, studio sections ...). */
export function Sheet() {
  const sheet = useUi((s) => s.openSheet);
  if (!sheet) return null;
  const { title, Component } = SHEETS[sheet];
  const close = () => useUi.getState().showSheet(null);
  return (
    <>
      <div className="scrim" onClick={close} />
      <section className="sheet" role="dialog" aria-label={title} data-testid={`sheet-${sheet}`}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="btn" onClick={close} data-testid="sheet-close">Close</button>
        </header>
        <div className="sheet-body"><Component /></div>
      </section>
    </>
  );
}
