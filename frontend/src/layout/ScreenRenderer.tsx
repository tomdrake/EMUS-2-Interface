import { useDesign } from "@/app/store";
import { label } from "@/design/text";
import type { LayoutNode, Screen } from "@/design/types";
import { WIDGETS } from "@/widgets";

/** Renders a screen's layout tree: splits become flex containers, leaves become widgets. */
export function ScreenRenderer({ screen }: { screen: Screen }) {
  return (
    <main className="screen" data-testid={`screen-${screen.id}`}>
      <Node node={screen.layout as LayoutNode} />
    </main>
  );
}

function Node({ node }: { node: LayoutNode }) {
  if (node.kind === "split") {
    const ratio = node.ratio;
    const [a, b] = node.children as [LayoutNode, LayoutNode];
    return (
      <div className={`split split-${node.direction}`} data-testid="split">
        <div className="pane" style={{ flex: `${ratio} 1 0` }}><Node node={a} /></div>
        <div className="pane" style={{ flex: `${1 - ratio} 1 0` }}><Node node={b} /></div>
      </div>
    );
  }
  const design = useDesign()!;
  const widget = node.widget;
  const Component = WIDGETS[widget.type] as (p: { widget: typeof widget }) => JSX.Element;
  return (
    <section className={`widget widget-${widget.type}`} data-widget={widget.id}
             data-testid={`widget-${widget.id}`}>
      {widget.title && <h2 className="widget-title">{label(widget.title, design)}</h2>}
      <Component widget={widget} />
    </section>
  );
}
