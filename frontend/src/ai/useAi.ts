import { useDesign } from "@/app/store";
import { useUi } from "@/app/store";
import type { Row } from "@/design/types";

/**
 * Whether AI marks are drawn. One master switch per screen (the AI On / Off button; local,
 * like dark / light) overrides the design's `ai.enabled`. A module's own `content.ai` turns
 * AI off for that module only. Off means nothing AI is drawn: no chips, certainty, trace
 * annotations or explain links.
 */
export function useAiOn(row?: Pick<Row, "content">): boolean {
  const design = useDesign();
  const override = useUi((s) => s.aiOverride);
  const master = override ?? design?.ai.enabled ?? true;
  return master && (row ? row.content.ai : true);
}
