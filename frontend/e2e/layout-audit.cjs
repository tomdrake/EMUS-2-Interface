// Layout audit: nothing readable may overlap anything else, be cut off, or sit against the edge of its box.
// Used by smoke.cjs and runnable on its own:  node e2e/layout-audit.cjs [baseUrl]
const AUDIT = () => {
  const PAD = 3;                       // text must be at least this far inside its box
  const isText = (n) => n.nodeType === 3 && n.textContent.trim().length > 0;
  const visible = (el) => { const s = getComputedStyle(el); return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0.05; };
  const clipOf = (el) => {
    let r = null;
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflow !== "visible" || s.overflowX !== "visible" || s.overflowY !== "visible") {
        let b = p.getBoundingClientRect();
        // A container that scrolls up and down hides nothing: what is below the fold is one swipe away.
        if (s.overflowY === "auto" || s.overflowY === "scroll") { b = { left: b.left, right: b.right, top: -1e6, bottom: 1e6 }; }
        r = r ? { l: Math.max(r.l, b.left), t: Math.max(r.t, b.top), r: Math.min(r.r, b.right), b: Math.min(r.b, b.bottom) } : { l: b.left, t: b.top, r: b.right, b: b.bottom };
      }
    }
    return r;
  };
  const owners = [];
  const walk = (root) => {
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const seen = new Map();
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!isText(n)) continue;
      const el = n.parentElement;
      if (!el || !visible(el) || el.closest("[aria-hidden='true']:not(svg)") || el.closest(".sr-only, script, style, [data-audit-ignore]")) continue;
      if (el.closest("svg") && !el.matches("text, tspan")) continue;
      if (!seen.has(el)) seen.set(el, []);
      seen.get(el).push(n);
    }
    for (const [el, nodes] of seen) {
      let box = null;
      for (const n of nodes) {
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const b of rg.getClientRects()) {
          if (b.width < 1 || b.height < 1) continue;
          box = box ? { l: Math.min(box.l, b.left), t: Math.min(box.t, b.top), r: Math.max(box.r, b.right), b: Math.max(box.b, b.bottom) } : { l: b.left, t: b.top, r: b.right, b: b.bottom };
        }
      }
      if (!box) continue;
      // Behind a sheet, a menu or anything else on top: not on screen, so not part of the layout being judged.
      const cx = (box.l + box.r) / 2, cy = (box.t + box.b) / 2;
      if (cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight) {
        const top = document.elementsFromPoint(cx, cy).find((e) => !e.classList.contains("row-hit") && !e.classList.contains("trace-mark-hit"));
        if (top && !(el.contains(top) || top.contains(el))) continue;
      }
      const clip = clipOf(el);
      let shown = box, cut = false;
      if (clip) {
        shown = { l: Math.max(box.l, clip.l), t: Math.max(box.t, clip.t), r: Math.min(box.r, clip.r), b: Math.min(box.b, clip.b) };
        if (shown.r <= shown.l || shown.b <= shown.t) continue;               // wholly clipped away: not on screen
        cut = shown.r < box.r - 1.5 || shown.b < box.b - 1.5 || shown.l > box.l + 1.5 || shown.t > box.t + 1.5;
      }
      const cs = getComputedStyle(el);
      // Inside a container that scrolls up and down, content below the fold is one swipe away: only sideways clipping is a fault.
      let scroller = null;
      for (let p = el.parentElement; p; p = p.parentElement) { const ps = getComputedStyle(p); if (ps.overflowY === "auto" || ps.overflowY === "scroll") { scroller = p; break; } }
      if (scroller) { const sb = scroller.getBoundingClientRect(); if (box.b <= sb.top || box.t >= sb.bottom) continue; cut = shown.r < box.r - 1.5 || shown.l > box.l + 1.5; }
      const ell = (cs.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 1) || ((cs.webkitLineClamp && cs.webkitLineClamp !== "none") && el.scrollHeight > el.clientHeight + 1);
      owners.push({ el, box: shown, cut: cut && !ell, ellipsis: ell });
    }
  };
  walk(document.body);
  const name = (o) => `${o.el.tagName.toLowerCase()}.${(o.el.getAttribute("class") || "").split(" ")[0]}"${o.el.textContent.trim().slice(0, 24)}"`;
  const problems = [];
  // 1. overlaps between readable things
  for (let i = 0; i < owners.length; i++) for (let j = i + 1; j < owners.length; j++) {
    const a = owners[i], b = owners[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const w = Math.min(a.box.r, b.box.r) - Math.max(a.box.l, b.box.l), h = Math.min(a.box.b, b.box.b) - Math.max(a.box.t, b.box.t);
    if (w > 1.5 && h > 2) problems.push(`overlap: ${name(a)} / ${name(b)} (${w.toFixed(0)}x${h.toFixed(0)})`);
  }
  // 2. cut off, or against the edge of its box
  const boxes = [...document.querySelectorAll(".module, .abcde-sec, .evidence, .style-card, .blood-set")];
  for (const o of owners) {
    if (o.cut) problems.push(`cut off: ${name(o)}`);
    const host = o.el.closest(".module, .abcde-sec, .evidence, .style-card, .blood-set");
    if (!host || !boxes.includes(host)) continue;
    const r = host.getBoundingClientRect();
    if (o.box.l < r.left + PAD || o.box.t < r.top + PAD || o.box.r > r.right - PAD || o.box.b > r.bottom - PAD) problems.push(`no padding: ${name(o)} in ${(host.dataset.testid || host.className).slice(0, 20)}`);
  }
  // 3. a graph must fit its box and its marks must stay inside the graph
  for (const svg of document.querySelectorAll("svg.trace-frame, .evidence-strip svg")) {
    const f = svg.getBoundingClientRect(), p = svg.parentElement.getBoundingClientRect();
    if (f.width > p.width + 1 || f.height > p.height + 1) problems.push(`graph larger than its box: ${svg.dataset.testid || svg.getAttribute("aria-label")}`);
    for (const t of svg.querySelectorAll("text")) {
      if (t.closest(".sweep")) continue;                                // labels on a moving strip slide under the plot edge
      const b = t.getBoundingClientRect();
      if (b.width && (b.left < f.left - 1 || b.right > f.right + 1 || b.top < f.top - 1 || b.bottom > f.bottom + 1)) problems.push(`graph label outside its graph: "${t.textContent.slice(0, 20)}"`);
    }
  }
  return { problems: [...new Set(problems)], ellipses: owners.filter((o) => o.ellipsis).map(name), count: owners.length };
};

async function audit(page) { return page.evaluate(AUDIT); }
module.exports = { audit, AUDIT };

if (require.main === module) {
  const { chromium } = require("playwright");
  const BASE = process.argv[2] ?? "http://127.0.0.1:8123";
  const STATES = [
    ["icu-monitor", "scn-pneumonia", 0], ["icu-monitor", "scn-pneumonia", 360], ["icu-monitor", "scn-af", 20], ["icu-monitor", "scn-vt", 5],
    ["icu-monitor", "scn-copd", -20], ["icu-monitor", "scn-technical", 4], ["icu-monitor", "scn-technical", 11], ["icu-monitor", "scn-technical", 14],
    ["icu-monitor", "scn-stable", 0], ["icu-modules", "scn-pneumonia", 180], ["icu-modules", "scn-af", 20], ["icu-modules", "scn-copd", -20],
    ["icu-modules", "scn-technical", 14], ["icu-modules", "scn-vt", 5],
  ];
  const SCREENS = [["icu-monitor", "abcde", "scn-pneumonia", 0], ["icu-monitor", "abcde", "scn-technical", 4], ["icu-monitor", "abcde", "scn-copd", -20], ["icu-monitor", "abcde", "scn-vt", 5],
    ["icu-monitor", "news2", "scn-pneumonia", 360], ["icu-monitor", "split-h", "scn-af", 20], ["icu-monitor", "split-v", "scn-pneumonia", 180], ["icu-modules", "abcde", "scn-af", 20]];
  const SHEETS = [["finding-explain", "FIRST"], ["trends", null], ["underlying-data", "hr"], ["underlying-data", "bp_sys"], ["explanation-examples", null], ["demo-controls", null], ["studio-appearance", null],
    ["studio-navigation", null], ["studio-forecast", null], ["versions", null], ["abcde-assess", "gcs"], ["abcde-assess", "avpu"], ["abcde-assess", "exposure"]];
  (async () => {
    const browser = await chromium.launch();
    let bad = 0;
    for (const vp of [{ w: 1280, h: 800 }, { w: 1024, h: 768 }]) {
      const page = await (await browser.newContext({ viewport: { width: vp.w, height: vp.h } })).newPage();
      await page.goto(BASE, { waitUntil: "networkidle" });
      for (const [design, scenario, minute] of STATES) for (const overlay of [false, true]) {
        await page.evaluate(async ([d, s, m, o]) => {
          localStorage.setItem("emus.ai-overlay", o ? "on" : "off");
          const ui = window.__emus.ui; const reg = ui.getState().registry;
          const r = await fetch(`/api/designs/${d}`).then((x) => x.json()); ui.getState().load(r, reg); ui.setState({ screenId: r.document.home_screen, aiOverlay: o });
          const ex = window.__emus.examples.getState(); await ex.setEnabled(true); await ex.setScenario(s); await ex.setMinute(m);
        }, [design, scenario, minute, overlay]);
        await page.waitForFunction(() => window.__emus.examples.getState().status === "ready", null, { timeout: 8000 });
        await page.waitForTimeout(500);
        const r = await audit(page);
        if (r.problems.length) { bad += r.problems.length; console.log(`\n${vp.w}x${vp.h} ${design} ${scenario}@${minute} overlay=${overlay}: ${r.problems.length}`); r.problems.slice(0, 14).forEach((p) => console.log("  " + p)); }
      }
      for (const [design, screen, scenario, minute] of SCREENS) {
        await page.evaluate(async ([d, sc, s, m]) => {
          const ui = window.__emus.ui; const reg = ui.getState().registry;
          const r = await fetch(`/api/designs/${d}`).then((x) => x.json()); ui.getState().load(r, reg); ui.setState({ screenId: sc, openSheet: null, openMenu: null });
          const ex = window.__emus.examples.getState(); await ex.setEnabled(true); await ex.setScenario(s); await ex.setMinute(m);
        }, [design, screen, scenario, minute]);
        await page.waitForFunction(() => window.__emus.examples.getState().status === "ready", null, { timeout: 8000 });
        await page.waitForTimeout(500);
        const r = await audit(page);
        if (r.problems.length) { bad += r.problems.length; console.log(`\n${vp.w}x${vp.h} ${design}/${screen} ${scenario}@${minute}: ${r.problems.length}`); r.problems.slice(0, 14).forEach((p) => console.log("  " + p)); }
      }
      await page.evaluate(async () => { const ui = window.__emus.ui; const r = await fetch("/api/designs/icu-monitor").then((x) => x.json()); ui.getState().load(r, ui.getState().registry); ui.setState({ screenId: "monitor" }); const ex = window.__emus.examples.getState(); await ex.setScenario("scn-af"); await ex.setMinute(20); });
      await page.waitForTimeout(600);
      for (const [sheet, ctx] of SHEETS) {
        await page.evaluate(([s, c]) => { const ex = window.__emus.examples.getState(); const id = c === "FIRST" ? ex.snapshot.findings[0].id : c; window.__emus.ui.getState().showSheet(s, id); }, [sheet, ctx]);
        await page.waitForTimeout(450);
        const r = await audit(page);
        if (r.problems.length) { bad += r.problems.length; console.log(`\n${vp.w}x${vp.h} sheet ${sheet} ${ctx ?? ""}: ${r.problems.length}`); r.problems.slice(0, 14).forEach((p) => console.log("  " + p)); }
        await page.evaluate(() => window.__emus.ui.getState().showSheet(null));
      }
      await page.close();
    }
    await browser.close();
    console.log(bad ? `\n${bad} layout problems` : "layout is clean");
    process.exit(bad ? 1 : 0);
  })();
}
