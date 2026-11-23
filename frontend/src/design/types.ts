// Hand-written conveniences over the generated design types. The generated file
// (types.gen.ts) is the source of truth for shapes; add only aliases/unions here.
import type {
  Design, Menu, MenuItem, Row, Screen, SplitNode, Tab, Theme, WidgetNode,
} from "./types.gen";

export type { Design, Menu, MenuItem, Row, Screen, SplitNode, Tab, Theme, WidgetNode };
export type * from "./types.gen";

export type LayoutNode = WidgetNode | SplitNode;
export type Widget = WidgetNode["widget"];
export type WidgetType = Widget["type"];
export type WidgetOf<T extends WidgetType> = Extract<Widget, { type: T }>;
export type ParameterId = NonNullable<Row["parameter"]>;
export type TabAction = Tab["action"];
export type MenuItemAction = MenuItem["action"];
export type Action = TabAction | MenuItemAction;
export type SheetId = Extract<Action, { type: "sheet" }>["sheet"];
export type IconId = NonNullable<Tab["icon"]>;

/** Envelope returned by GET /api/active-design and /api/designs/{id}. */
export interface StoredDesign {
  meta: {
    id: string; name: string; description: string; builtin: boolean;
    parent_id: string | null; current_version: number; created_at: string; updated_at: string;
  };
  version: number;
  source: "seed" | "manual" | "chat" | "import" | "revert";
  author: string;
  note: string;
  created_at: string;
  document: Design;
}

export const SETTINGS_MENU_ID = "settings";
