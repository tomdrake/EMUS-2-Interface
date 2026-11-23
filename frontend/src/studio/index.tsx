import type { SheetId } from "@/design/types";
import { Placeholder } from "@/widgets/Placeholder";

const stub = (name: string, milestone: string) => () => <Placeholder name={name} milestone={milestone} />;

/**
 * Sheet id -> panel. Clinical sheets and design-studio sections.
 * Each milestone replaces its stubs with real components (one file per sheet).
 */
export const SHEETS: Record<SheetId, { title: string; Component: () => JSX.Element }> = {
  "alarm-limits": { title: "Alarm limits", Component: stub("Alarm limits (steppers per parameter)", "M2") },
  oxygen: { title: "Oxygen", Component: stub("Oxygen flow and device", "M2") },
  patient: { title: "Patient", Component: stub("Patient details", "M2") },
  "record-observations": { title: "Record observations", Component: stub("Manual BP, temperature, ACVPU and other observations", "M3") },
  "finding-explain": { title: "Why the AI says this", Component: stub("Evidence, certainty and questions for one finding", "M7") },
  "demo-controls": { title: "Demo controls", Component: stub("Scenario, replay speed, jump in time", "M2") },
  "news2-variant": { title: "NEWS2 chart style", Component: stub("Light bands / dark bands / dark trend", "M3") },
  "home-screen": { title: "Home screen", Component: stub("Choose the home screen", "M3") },
  "studio-appearance": { title: "Appearance", Component: stub("Theme presets, colours, text size", "M4") },
  "studio-layout": { title: "Screens and layout", Component: stub("Screens, splits, widgets", "M4") },
  "studio-rows": { title: "Rows", Component: stub("Add, remove, reorder and style rows", "M4") },
  "studio-navigation": { title: "Tabs and menus", Component: stub("Tabs, menus, top bar fields", "M4") },
  "studio-alarms": { title: "Alarm defaults", Component: stub("Default limits and alarm presentation", "M4") },
  "studio-forecast": { title: "Forecast and certainty", Component: stub("Forecast display options and certainty metric", "M7") },
  versions: { title: "Versions", Component: stub("Version history, revert, duplicate, export", "M4") },
  assistant: { title: "Redesign with AI", Component: stub("Chat to redesign", "M5") },
  "api-tokens": { title: "API tokens", Component: stub("Claude and ELM tokens", "M5") },
  "forecast-horizon": { title: "Forecast horizon", Component: stub("Choose how far ahead to look", "M7") },
  about: { title: "About", Component: About },
};

function About() {
  return (
    <div className="about">
      <p><strong>EMUS-2 co-design patient monitor.</strong> A prototype for design workshops
        with clinicians. It is not a medical device and must not be used for patient care.</p>
      <p>Data shown is simulated or from the open-access MIMIC-IV demo. AI findings and
        forecasts are placeholders until the causal model is connected.</p>
    </div>
  );
}
