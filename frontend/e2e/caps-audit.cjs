// Capitalisation audit: labels, buttons, headings, tile names and chips are Title Case; sentences are not touched.
// Used by smoke.cjs and runnable on its own:  node e2e/caps-audit.cjs [baseUrl]
const CAPS = () => {
  const SMALL = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with", "per", "is"]);
  const UNITS = new Set(["h", "min", "s", "ms", "bpm", "mmhg", "kpa", "l", "mv", "mm", "a.u.", "kg", "y", "m", "f", "mmol/l", "g/l", "u/l", "ng/l", "mg/l", "µmol/l", "pco2", "po2", "ph", "o2", "spo2"]);
  const SEL = 'button, label, h1, h2, h3, h4, th, legend, option, figcaption, dt, .tile-name, .row-label, .row-method, .tab-label, .choice-opt, .setting-label, .ai-text, .certainty-name, .bp-head, .abcde-status, .blood-recency, .tile-state, .position-word, .position-meaning, .style-head strong, .style-head span, .trace-label, .key-text, .xscale-text, .badge';
  const bad = [];
  const words = (t) => t.split(/\s+/).filter(Boolean);
  const wordOk = (w, first) => {
    const core = w.replace(/^[("'“\u2014\-–·]+|[)"'”,.:;!?·]+$/g, "");
    if (!core || !/^[a-z]/.test(core)) return true;                       // capital, digit or symbol
    if (/[0-9/.]/.test(core) || UNITS.has(core.toLowerCase())) return true;   // units and things like "a.u." and "mm/s"
    if (!first && SMALL.has(core)) return true;
    return false;
  };
  for (const el of document.querySelectorAll(SEL)) {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if (el.closest("[data-prose], .sr-only, svg:not(:has(text)) ")) continue;
    if (el.matches(".trace-label, .key-text, .xscale-text") === false && el.children.length > 0 && el.matches("button, label")) { /* use own text only */ }
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim();
    if (!own || own.length < 2) continue;
    const ws = words(own);
    if (ws.length > 7) continue;                                           // a sentence, not a label
    if (/^[0-9]/.test(own) && ws.length === 1) continue;
    // unit suffixes after a number ("2 L", "25 mm/s", "4 h") are fine
    const offenders = ws.filter((w, i) => !wordOk(w, i === 0 && !/^[0-9]/.test(ws[0])));
    const nonNumeric = offenders.filter((w) => !/^[0-9.\-:/()%]+$/.test(w));
    if (nonNumeric.length) bad.push(`${el.tagName.toLowerCase()}.${(el.getAttribute("class") || "").split(" ")[0]} "${own.slice(0, 40)}" -> ${nonNumeric.slice(0, 3).join(", ")}`);
  }
  return [...new Set(bad)];
};

async function capsAudit(page) { return page.evaluate(CAPS); }
module.exports = { capsAudit, CAPS };

if (require.main === module) {
  const { chromium } = require("playwright");
  const BASE = process.argv[2] ?? "http://127.0.0.1:8123";
  const SCREENS = [["icu-monitor", "monitor"], ["icu-modules", "monitor"], ["icu-monitor", "abcde"], ["icu-monitor", "news2"], ["icu-monitor", "split-h"], ["icu-monitor", "epr"], ["icu-monitor", "predict"], ["icu-monitor", "monitor-predict"], ["icu-monitor", "alarms"]];
  const SHEETS = [["finding-explain", "FIRST"], ["trends", null], ["underlying-data", null], ["underlying-data", "hr"], ["explanation-examples", null], ["demo-controls", null], ["studio-appearance", null], ["studio-navigation", null],
    ["studio-forecast", null], ["versions", null], ["abcde-assess", "gcs"], ["abcde-assess", "avpu"], ["abcde-assess", "exposure"], ["about", null], ["alarm-limits", "ecg"]];
  (async () => {
    const browser = await chromium.launch();
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    const all = new Set();
    const set = async (scenario, minute) => page.evaluate(async ([s, m]) => { const ex = window.__emus.examples.getState(); await ex.setEnabled(true); await ex.setScenario(s); await ex.setMinute(m); }, [scenario, minute]);
    for (const [scenario, minute] of [["scn-af", 20], ["scn-copd", -20], ["scn-technical", 14], ["scn-pneumonia", 180]]) {
      await set(scenario, minute);
      await page.waitForFunction(() => window.__emus.examples.getState().status === "ready", null, { timeout: 8000 });
      for (const [design, screen] of SCREENS) {
        await page.evaluate(async ([d, sc]) => { const ui = window.__emus.ui; const r = await fetch(`/api/designs/${d}`).then((x) => x.json()); ui.getState().load(r, ui.getState().registry); ui.setState({ screenId: sc, openSheet: null }); }, [design, screen]);
        await page.waitForTimeout(350);
        (await capsAudit(page)).forEach((b) => all.add(`[${design}/${screen}] ${b}`));
      }
      if (scenario === "scn-af") for (const [sheet, ctx] of SHEETS) {
        await page.evaluate(([s, c]) => { const ex = window.__emus.examples.getState(); window.__emus.ui.getState().showSheet(s, c === "FIRST" ? ex.snapshot.findings[0].id : c); }, [sheet, ctx]);
        await page.waitForTimeout(350);
        (await capsAudit(page)).forEach((b) => all.add(`[sheet ${sheet} ${ctx ?? ""}] ${b}`));
        await page.evaluate(() => window.__emus.ui.getState().showSheet(null));
      }
    }
    // menus
    await page.evaluate(async () => { const ui = window.__emus.ui; const r = await fetch("/api/designs/icu-monitor").then((x) => x.json()); ui.getState().load(r, ui.getState().registry); ui.setState({ screenId: "monitor" }); });
    for (const id of ["settings", "views", "patient"]) {
      await page.evaluate((m) => { const ui = window.__emus.ui.getState(); ui.showMenu(ui.stored.document.menus.find((x) => x.id === m)); }, id);
      await page.waitForTimeout(300);
      (await capsAudit(page)).forEach((b) => all.add(`[menu ${id}] ${b}`));
      await page.evaluate(() => window.__emus.ui.getState().showMenu(null));
    }
    await browser.close();
    [...all].sort().forEach((x) => console.log(x));
    console.log(all.size ? `\n${all.size} capitalisation problems` : "capitalisation is clean");
    process.exit(all.size ? 1 : 0);
  })();
}
