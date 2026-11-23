import type { Design, StoredDesign } from "@/design/types";

/** Thrown for any non-2xx response. `milestone` is set for scaffolded (501) routes. */
export class ApiError extends Error {
  constructor(public status: number, message: string, public detail?: unknown,
              public milestone?: string) {
    super(message);
  }
  get notBuilt(): boolean {
    return this.status === 501;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let detail: any;
    try { detail = (await res.json()).detail; } catch { /* not JSON */ }
    const milestone = typeof detail === "object" ? detail?.milestone : undefined;
    const message = milestone ? `Not built yet (${milestone})`
      : typeof detail === "string" ? detail : `${method} ${path} failed (${res.status})`;
    throw new ApiError(res.status, message, detail, milestone);
  }
  return res.json() as Promise<T>;
}

export const get = <T>(path: string) => request<T>("GET", path);
export const post = <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {});
export const put = <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {});
export const del = <T>(path: string) => request<T>("DELETE", path);

/** Read-only clinical vocabulary (backend/app/registry.py). */
export interface Registry {
  alarm_silence_seconds: number;
  safety: {
    connection_lost_after_s: number; display_stale_after_s: number; value_stale_after_s: number;
    battery_low_pct: number; battery_critical_pct: number;
    sqi_poor_below: number; sqi_unusable_below: number;
  };
  signal_states: Record<string, { text: string; shows_value: boolean; tone: string; meaning: string }>;
  signal_issues: Record<string, { label: string; advice: string }>;
  technical_alarms: Record<string, { label: string; priority: "high" | "medium" | "low"; message: string }>;
  device_kinds: Record<string, string>;
  demo_faults: Record<string, string>;
  parameters: Record<string, {
    id: string; label: string; short: string; unit: string; decimals: number;
    kind: string; default_low: number | null; default_high: number | null;
    min_value: number | null; max_value: number | null; waveforms: string[]; note: string;
    method: string;
  }>;
  waveforms: Record<string, { label: string; hz: number; unit: string; parameter: string }>;
  o2_devices: Record<string, string>;
  acvpu_levels: string[];
  lab_groups: Record<string, string>;
  lab_tests: Record<string, { id: string; label: string; group: string; unit: string;
    low: number | null; high: number | null; decimals: number }>;
  event_types: Record<string, { label: string; parameter: string | null }>;
  rhythm_labels: Record<string, string>;
  certainty_metrics: Record<string, { id: string; group: string; label: string;
    tells_you: string; applies_to: string[]; note: string }>;
}

export interface PatchPreview {
  ok: boolean; errors: string[]; touched: string[]; document: Design | null;
  max_touch_depth?: number;
}

export const api = {
  registry: () => get<Registry>("/api/registry"),
  activeDesign: () => get<StoredDesign>("/api/active-design"),
  design: (id: string, version?: number) =>
    get<StoredDesign>(`/api/designs/${id}${version ? `?version=${version}` : ""}`),
  designs: () => get<StoredDesign["meta"][]>("/api/designs"),
  themePresets: () => get<Record<string, Design["theme"]>>("/api/theme-presets"),
  previewPatch: (id: string, ops: unknown[]) =>
    post<PatchPreview>(`/api/designs/${id}/preview-patch`, { ops }),
  // Later milestones add their calls here (patients, stream, alarms, chat, ...).
  silence: (patientId: string, by = "") =>
    post<{ silenced_until: string | null }>(`/api/patients/${patientId}/alarms/silence`, { by }),
  unsilence: (patientId: string) =>
    del<{ silenced_until: string | null }>(`/api/patients/${patientId}/alarms/silence`),
};
