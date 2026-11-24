import type { Widget, WidgetOf, WidgetType } from "@/design/types";

import { MonitorGrid } from "./MonitorGrid";
import { Abcde } from "./Abcde";
import { News2Chart } from "./News2Chart";
import { Placeholder } from "./Placeholder";

type WidgetComponent<T extends WidgetType> = (props: { widget: WidgetOf<T> }) => JSX.Element;

const stub = (name: string, milestone: string, detail?: (w: Widget) => string) =>
  ({ widget }: { widget: Widget }) => (
    <Placeholder name={name} milestone={milestone}>
      {detail && <div className="placeholder-detail">{detail(widget)}</div>}
    </Placeholder>
  );

/**
 * Widget type -> component. Each milestone replaces its stubs with real components
 * in this folder (one file per widget) and keeps this map as the only registry.
 */
export const WIDGETS: { [T in WidgetType]: WidgetComponent<T> } = {
  "monitor-grid": MonitorGrid,
  "news2-chart": News2Chart,
  abcde: Abcde,
  "epr-labs": stub("Laboratory results", "M6"),
  "epr-imaging": stub("Imaging", "M6"),
  "ai-summary": stub("AI findings", "M7"),
  "forecast-panel": stub("Forecast and future NEWS", "M7"),
  "events-timeline": stub("Events timeline", "M7"),
  alarms: stub("Alarm limits and history", "M2"),
  oxygen: stub("Oxygen", "M2"),
  patient: stub("Patient details", "M2"),
  text: ({ widget }) => <p className="text-widget">{widget.body}</p>,
};
