import type { SheetId } from "@/design/types";
import { Placeholder } from "@/widgets/Placeholder";

import { AbcdeAssess } from "./AbcdeAssess";
import { AiSettingsSheet } from "./AiSettingsSheet";
import { AppearanceSheet } from "./AppearanceSheet";
import { DemoControls } from "./DemoControls";
import { NavigationSheet } from "./NavigationSheet";
import { News2Breakdown } from "./News2Breakdown";
import { TrendsSheet } from "./TrendsSheet";
import { VersionsSheet } from "./VersionsSheet";
import { ExplanationExamples } from "./ExplanationExamples";
import { UnderlyingData } from "./UnderlyingData";
import { WhySheet } from "./WhySheet";

const stub = (name: string, milestone: string) => () => <Placeholder name={name} milestone={milestone} />;

/**
 * Sheet id -> panel. Clinical sheets and design-studio sections.
 * Each milestone replaces its stubs with real components (one file per sheet).
 */
export const SHEETS: Record<SheetId, { title: string; Component: () => JSX.Element }> = {
  "alarm-limits": { title: "Alarm Limits", Component: stub("Alarm limits (steppers per parameter)", "M2") },
  oxygen: { title: "Oxygen", Component: stub("Oxygen flow and device", "M2") },
  patient: { title: "Patient", Component: stub("Patient details", "M2") },
  "new-patient": { title: "New Patient", Component: stub("Admit a patient: name, date of birth, NHS number, bed; nothing carried over", "M2") },
  "discharge-patient": { title: "Discharge Patient", Component: stub("Confirm by name, then stop monitoring and clear the screen", "M2") },
  "record-observations": { title: "Record Observations", Component: stub("Manual BP, temperature, ACVPU and other observations", "M3") },
  "finding-explain": { title: "Why the AI Says This", Component: WhySheet },
  "underlying-data": { title: "Underlying Data", Component: UnderlyingData },
  "explanation-examples": { title: "Explanation Examples", Component: ExplanationExamples },
  trends: { title: "Trends", Component: TrendsSheet },
  "abcde-assess": { title: "Assess", Component: AbcdeAssess },
  "news2-breakdown": { title: "NEWS2 Breakdown", Component: News2Breakdown },
  "demo-controls": { title: "Demo Controls", Component: DemoControls },
  "news2-variant": { title: "NEWS2 Chart Style", Component: stub("Light bands / dark bands / dark trend", "M3") },
  "home-screen": { title: "Home Screen", Component: stub("Choose the home screen", "M3") },
  "studio-appearance": { title: "Appearance", Component: AppearanceSheet },
  "studio-layout": { title: "Screens and Layout", Component: stub("Screens, splits, widgets", "M4") },
  "studio-rows": { title: "Rows", Component: stub("Add, remove, reorder and style rows", "M4") },
  "studio-navigation": { title: "Tabs and Menus", Component: NavigationSheet },
  "studio-alarms": { title: "Alarm Defaults", Component: stub("Default limits and alarm presentation", "M4") },
  "studio-forecast": { title: "AI and Certainty", Component: AiSettingsSheet },
  versions: { title: "Versions", Component: VersionsSheet },
  assistant: { title: "Redesign With AI", Component: stub("Chat to redesign", "M5") },
  "api-tokens": { title: "API Tokens", Component: stub("Claude and ELM tokens", "M5") },
  "forecast-horizon": { title: "Forecast Horizon", Component: stub("Choose how far ahead to look", "M7") },
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
