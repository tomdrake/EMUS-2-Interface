import { useCallback, useEffect, useState } from "react";

import { api, type VersionInfo } from "@/app/api";
import { useUi } from "@/app/store";
import { fmtDateTime, useFormats } from "@/design/datetime";
import type { StoredDesign } from "@/design/types";

const AUTHOR_KEY = "emus.author";
const author = (): string => { try { return window.localStorage.getItem(AUTHOR_KEY) ?? ""; } catch { return ""; } };


/**
 * History, copies and the start-up design. Every save is a new version and nothing is ever rewritten,
 * so a revert is itself a new version. Built-in designs are read-only; copy one to change it.
 */
export function VersionsSheet() {
  const formats = useFormats();
  const when = (iso: string) => fmtDateTime(iso, formats, { short: true });
  const stored = useUi((s) => s.stored)!;
  const registry = useUi((s) => s.registry)!;
  const dirty = useUi((s) => !!s.draft);
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [designs, setDesigns] = useState<StoredDesign["meta"][]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [paste, setPaste] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const id = stored.meta.id;

  const refresh = useCallback(() => {
    api.versions(id).then(setVersions).catch(() => setVersions([]));
    api.designs().then(setDesigns).catch(() => undefined);
    api.activeDesign().then((a) => setActive(a.meta.id)).catch(() => undefined);
  }, [id]);
  useEffect(refresh, [refresh, stored.version]);

  const show = (s: StoredDesign, text: string) => {
    const ui = useUi.getState();
    ui.load(s, registry);
    ui.setDraft(null);
    setMessage(text);
    refresh();
  };
  const run = async (fn: () => Promise<void>) => { try { await fn(); } catch (e) { setMessage(String((e as Error).message ?? e)); } };

  const exportJson = () => run(async () => {
    const data = await api.exportDesign(id);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${id}.json`; a.click();
    URL.revokeObjectURL(url);
    setMessage(`Exported ${id}.json with ${versions.length} versions.`);
  });

  return (
    <div className="settings" data-testid="versions">
      <h3 data-testid="versions-title">{stored.meta.name} <small>version {stored.version}{stored.meta.builtin ? ", built in (read-only)" : ""}</small></h3>
      {dirty && <p className="demo-note" data-testid="versions-dirty">You have unsaved changes. Save or discard them before reverting, copying or switching design.</p>}
      {message && <p className="demo-note" role="status" data-testid="versions-message">{message}</p>}

      <h4>History</h4>
      <ol className="version-list" data-testid="version-list">
        {versions.map((v) => (
          <li key={v.version} data-version={v.version}>
            <div>
              <strong>Version {v.version}</strong> · {v.source} · {when(v.created_at)}{v.author && ` · ${v.author}`}
              {v.note && <div className="why-note">{v.note}</div>}
              {v.touched.length > 0 && <div className="why-note">Changed: {v.touched.join(", ")}</div>}
            </div>
            {!stored.meta.builtin && v.version !== stored.version && (
              <button type="button" className="btn" disabled={dirty} data-testid={`revert-${v.version}`}
                      onClick={() => run(async () => show(await api.revert(id, v.version, author()), `Reverted: saved as version ${stored.version + 1}.`))}>Revert</button>
            )}
          </li>
        ))}
      </ol>

      <h4>Copy This Design</h4>
      <div className="inline-form">
        <input value={name} placeholder={`${stored.meta.name} copy`} maxLength={60} onChange={(e) => setName(e.target.value)} data-testid="copy-name" aria-label="Name of the copy" />
        <button type="button" className="btn" disabled={dirty} data-testid="copy-design"
                onClick={() => run(async () => { const s = await api.duplicate(id, name || `${stored.meta.name} copy`, author()); show(s, `Made "${s.meta.name}".`); setName(""); })}>Copy</button>
      </div>

      <h4>Start-Up Design</h4>
      <div className="choice choice-col" role="radiogroup" aria-label="Start-Up Design">
        {designs.map((d) => (
          <button key={d.id} type="button" role="radio" aria-checked={d.id === active} className={`choice-opt${d.id === active ? " is-current" : ""}`}
                  data-testid={`startup-${d.id}`} disabled={dirty}
                  onClick={() => run(async () => { const s = await api.setActive(d.id, author()); show(s, `"${s.meta.name}" will show when the monitor starts.`); })}>
            {d.name}{d.builtin ? " (Built In)" : ""}
          </button>
        ))}
      </div>

      <h4>Export and Import</h4>
      <div className="panel-buttons">
        <button type="button" className="btn" onClick={exportJson} data-testid="export-design">Export JSON</button>
      </div>
      <label className="field">Paste A Design To Import
        <textarea value={paste} rows={4} onChange={(e) => setPaste(e.target.value)} data-testid="import-text" />
      </label>
      <button type="button" className="btn" disabled={!paste.trim() || dirty} data-testid="import-design"
              onClick={() => run(async () => { const s = await api.importDesign(JSON.parse(paste)); setPaste(""); show(s, `Imported "${s.meta.name}".`); })}>Import</button>

      {!stored.meta.builtin && (
        <>
          <h4>Delete</h4>
          {!confirmDelete
            ? <button type="button" className="btn" onClick={() => setConfirmDelete(true)} data-testid="delete-design">Delete This Design</button>
            : (
              <div className="inline-form">
                <span>Delete "{stored.meta.name}" and its history?</span>
                <button type="button" className="btn btn-primary" data-testid="delete-confirm"
                        onClick={() => run(async () => { await api.deleteDesign(id); show(await api.activeDesign(), "Deleted."); setConfirmDelete(false); })}>Delete</button>
                <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>Keep</button>
              </div>
            )}
        </>
      )}
    </div>
  );
}
