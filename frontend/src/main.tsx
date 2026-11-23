import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app/App";
import { useUi } from "./app/store";
import { useSafety } from "./safety/store";
import "./styles.css";

// Handle for the browser checks (e2e/smoke.cjs) and for showing a failure mode on
// demand before the simulator can inject it. Not used by the app itself.
(window as unknown as { __emus: unknown }).__emus = { ui: useUi, safety: useSafety };

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
