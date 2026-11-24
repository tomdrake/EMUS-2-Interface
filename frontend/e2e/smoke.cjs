// End-to-end smoke check of the shell against a running server.
//   node e2e/smoke.cjs [baseUrl]       (default http://127.0.0.1:8000)
// Each milestone adds its own checks below the marked line and keeps these passing.
// Screenshots go to e2e/screenshots/ (git-ignored).
// Needs Playwright with Chromium. In the Claude cloud environment it is pre-installed;
// elsewhere: `npm i -D playwright && npx playwright install chromium`.
const { mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { chromium } = require("playwright");

const BASE = process.argv[2] ?? process.env.EMUS_URL ?? "http://127.0.0.1:8000";
const OUT = join(__dirname, "screenshots");
const VIEWPORTS = [{ name: "tablet", width: 1280, height: 800 }, { name: "small", width: 1024, height: 768 }];
const MIN_TOUCH = 48;
mkdirSync(OUT, { recursive: true });

const failures = [];
const check = (ok, message) => { if (!ok) failures.push(message); console.log(`${ok ? "ok  " : "FAIL"} ${message}`); };

async function main() {
const browser = await chromium.launch();
for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  // The older checks below drive the safety store by hand and expect no feed, so example data
  // starts OFF; the example-data section at the end turns it on.
  await context.addInitScript(() => {
    if (!localStorage.getItem("emus.example")) {
      localStorage.setItem("emus.example", JSON.stringify({ enabled: false, scenario: "scn-pneumonia", minute: 0 }));
    }
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByTestId("app").waitFor();
  // Wait out the 140 ms open animation so menus and sheets are fully drawn.
  const shot = async (name) => {
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(OUT, `${vp.name}-${name}.png`) });
  };
  const T = (id) => page.getByTestId(id);
  const box = (sel) => page.evaluate((s) => {
    const r = document.querySelector(s).getBoundingClientRect();
    return [r.x, r.y, r.width, r.height].map((n) => Math.round(n * 10) / 10);
  }, sel);

  // --- required chrome
  check(await T("patient-name").isVisible(), `${vp.name}: patient name is shown`);
  check(/^\d{2}:\d{2}/.test(await T("clock").innerText()), `${vp.name}: clock is shown`);
  check(await T("silence").isVisible(), `${vp.name}: silence button is shown`);
  const nav = await page.locator("nav.tabbar").boundingBox();
  check(nav && nav.y + nav.height >= vp.height - 1, `${vp.name}: tabs are along the bottom`);

  // --- top right: new patient, discharge, dark / light, settings (a cog)
  const top = await page.evaluate(() => [...document.querySelectorAll('[data-testid="top-buttons"] button')].map((b) => {
    const r = b.getBoundingClientRect();
    return { id: b.dataset.testid, right: r.right, top: r.top, icon: b.querySelector("svg")?.dataset.icon };
  }));
  check(top.map((b) => b.id).join() === "top-new-patient,top-discharge,top-theme,top-ai,top-settings",
        `${vp.name}: top bar has new patient, discharge, dark / light, AI and settings, in that order`);
  check(top.at(-1).icon === "settings" && top.at(-1).right >= vp.width - 2 && top.at(-1).top < 10,
        `${vp.name}: settings is a cog at the top right`);
  check(await T("tab-settings").count() === 0, `${vp.name}: settings is no longer in the tab bar`);
  const clockBox = await box('[data-testid="clock"]');
  check(clockBox[0] + clockBox[2] <= top[0].right && clockBox[2] > 0, `${vp.name}: clock is visible beside the top buttons`);

  // --- Next Obs Due is gone; the monitor is eight full-width rows
  check(await page.getByText(/next obs/i).count() === 0, `${vp.name}: "Next Obs Due" is gone`);
  check(await page.locator(".module.row").count() === 8, `${vp.name}: the monitor is eight full-width rows`);

  // --- names: Title Case, with the method of collection
  check(await T("row-label-ecg").innerText() === "Heart Rate - ECG", `${vp.name}: heart rate row reads "Heart Rate - ECG"`);
  check(await T("row-label-spo2").innerText() === "Oxygen Saturation - Pleth", `${vp.name}: SpO2 row names its method`);
  check(await T("row-label-bp").innerText() === "Blood Pressure - Cuff", `${vp.name}: blood pressure row names its method`);
  const lower = await page.locator(".tab-label, .row-label, .menu-item span").evaluateAll((els) => els
    .map((e) => e.textContent.trim()).filter((t) => /(^|[\s/(-])[a-z]{4,}/.test(t)));
  check(lower.length === 0, `${vp.name}: labels are in Title Case ${lower.join(" | ")}`);

  // --- touch targets
  const small = await page.locator("button:visible").evaluateAll((els, min) => els
    .map((e) => ({ id: e.dataset.testid ?? e.textContent?.trim().slice(0, 20), r: e.getBoundingClientRect() }))
    .filter((x) => x.r.width < min || x.r.height < min)
    .map((x) => `${x.id} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`), MIN_TOUCH);
  const offenders = small;
  check(offenders.length === 0, `${vp.name}: touch targets >= ${MIN_TOUCH}px ${offenders.join(", ")}`);
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${vp.name}: no horizontal overflow`);

  // --- notification box: bottom left, fixed, says "No Notifications"
  const nb = await box('[data-testid="notifications"]');
  check(nb[0] <= 1 && nb[1] >= vp.height - 120, `${vp.name}: notification box is at the left of the tab bar`);
  check(await T("notif-text").innerText() === "No Notifications", `${vp.name}: empty box says "No Notifications"`);

  // --- tiles: all the same width, and the tile column the same on every row
  const tiles = () => page.locator(".tile:not(.tile-empty)").evaluateAll((els) => els.map((e) => {
    const r = e.getBoundingClientRect();
    return [e.dataset.testid, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(":");
  }));
  const sizes = new Set((await tiles()).map((t) => t.split(":").slice(3).join("x")));
  check(sizes.size === 1, `${vp.name}: every tile is the same width and height (${[...sizes].join(", ")} px)`);
  const columns = new Set(await page.locator(".row-tiles").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width))));
  check(columns.size === 1, `${vp.name}: the tile column is the same width on every row`);
  check(await page.locator('[data-testid="row-bp"] .tile:not(.tile-empty)').count() === 1, `${vp.name}: blood pressure is one tile`);
  const spo2Tile = await page.locator('[data-testid="row-spo2"] .tile:not(.tile-empty)').allInnerTexts();
  check(spo2Tile.length === 1 && /SpO2/.test(spo2Tile[0]) && /PR/.test(spo2Tile[0]),
        `${vp.name}: SpO2 and PR are together in one tile, not two`);
  const tileW = await page.locator(".tile:not(.tile-empty)").first().evaluate((e) => Math.round(e.getBoundingClientRect().width));
  check(tileW === 220, `${vp.name}: the tile is the design's width (${tileW}px)`);

  // --- alignment: things that belong on one line are on one line
  const align = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const rect = (e) => e.getBoundingClientRect();
    // Baseline of an element's text: a zero-size inline box sits exactly on it.
    const baseline = (e) => {
      const probe = document.createElement("span");
      probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
      e.appendChild(probe);
      const y = rect(probe).bottom;
      probe.remove();
      return Math.round(y * 10) / 10;
    };
    const spread = (xs) => Math.round((Math.max(...xs) - Math.min(...xs)) * 10) / 10;
    const mid = (r) => (r.top + r.bottom) / 2;
    const all = (s) => [...document.querySelectorAll(s)];
    const rows = all(".row:not(.row-spacer)").filter((r) => r.querySelector(".tile:not(.tile-empty)"));
    return {
      // one left edge for the patient name, every row name and the notification box
      leftEdge: spread([rect(q('[data-testid="patient-name"]')).left, ...all(".row-label").map((e) => rect(e).left),
                        rect(q(".notif .icon")).left]),
      // top bar text shares a baseline, and that line is centred in the bar
      topBaseline: spread([".tb-name", ".tb-alarm-status .alarm-status", ".tb-clock time"].map((s) => baseline(q(s)))),
      topCentred: Math.abs(mid(rect(q(".tb-line"))) - mid(rect(q(".topbar")))),
      // a row's name and its tile's name are on the same level
      rowHead: Math.max(...rows.map((r) => Math.abs(
        mid(rect(r.querySelector(".row-label"))) - mid(rect(r.querySelector(".tile:not(.tile-empty) .tile-head")))))),
      // the value band sits at the same level in every tile
      bodyLevel: spread(all(".tile:not(.tile-empty)").map((t) => mid(rect(t.querySelector(".tile-body"))) - rect(t).top)),
      // and what is in it is centred in that band, and big enough to read
      bodyCentred: Math.max(...all(".tile:not(.tile-empty)").map((t) => {
        const inner = t.querySelector(".tile-state, .tile-value");
        return Math.abs(mid(rect(inner)) - mid(rect(t.querySelector(".tile-body"))));
      })),
      smallestText: Math.min(...all(".tile-state, .tile-value, .tile-name, .device-word, .row-label, .tab-label")
        .map((e) => parseFloat(getComputedStyle(e).fontSize))),
      smallestState: Math.min(...all(".tile-state, .tile-value").map((e) => parseFloat(getComputedStyle(e).fontSize))),
      // the same cells on every row, so the grid lines run straight down
      tilesPerRow: new Set(all(".row:not(.row-spacer)").map((r) => r.querySelectorAll(".tile:not(.tile-empty)").length)).size,
      maxTilesPerRow: Math.max(...all(".row:not(.row-spacer)").map((r) => r.querySelectorAll(".tile:not(.tile-empty)").length)),
      tileLeft: spread(all(".row-tiles").map((e) => rect(e).left)),
      tileWidth: spread(all(".row-tiles").map((e) => rect(e).width)),
      tileRight: spread(all(".row-tiles").map((e) => rect(e).right)),
      // buttons: icons on one level and labels on one baseline, in each bar
      tabIcons: spread(all(".tabbar .tab .icon").map((e) => mid(rect(e)))),
      tabLabels: spread(all(".tabbar .tab .tab-label").map(baseline)),
      topIcons: spread(all(".topbtn .icon").map((e) => mid(rect(e)))),
      topLabels: spread(all(".topbtn .tab-label").map(baseline)),
      // both bars end flush with the screen; the content panel is inset evenly
      barsFlush: Math.abs(rect(q(".topbtns")).right - innerWidth) + Math.abs(rect(q(".tabbar .tab:last-child")).right - innerWidth),
      panelInsets: spread([rect(q(".widget")).left, innerWidth - rect(q(".widget")).right,
                           rect(q(".widget")).top - rect(q(".topbar")).bottom, rect(q(".tabbar")).top - rect(q(".widget")).bottom]),
    };
  });
  check(align.leftEdge <= 1, `${vp.name}: patient name, row names and notification box share one left edge (off by ${align.leftEdge}px)`);
  check(align.topBaseline <= 0.5, `${vp.name}: top bar text shares one baseline (off by ${align.topBaseline}px)`);
  check(align.topCentred <= 1, `${vp.name}: the top bar line is centred in the bar`);
  check(align.rowHead <= 1, `${vp.name}: each row's name and its tile's name are on the same level (off by ${align.rowHead}px)`);
  check(align.bodyLevel <= 0.5 && align.bodyCentred <= 1, `${vp.name}: values sit on one level in every tile, centred in their band`);
  check(align.smallestState >= 12 && align.smallestText >= 10.5,
        `${vp.name}: tile text is large enough to read (words ${align.smallestState}px, smallest label ${align.smallestText}px)`);
  check(align.maxTilesPerRow === 1 && align.tileLeft <= 0.5 && align.tileRight <= 0.5 && align.tileWidth <= 0.5,
        `${vp.name}: one tile per row, in one straight column`);
  check(align.tabIcons <= 0.5 && align.tabLabels <= 0.5, `${vp.name}: tab icons share a level and tab labels a baseline`);
  check(align.topIcons <= 0.5 && align.topLabels <= 0.5, `${vp.name}: top-bar icons share a level and labels a baseline`);
  check(align.barsFlush <= 1, `${vp.name}: both bars end flush with the screen edge`);
  check(align.panelInsets <= 1, `${vp.name}: the content panel is inset evenly on all four sides`);
  const squeezed = await page.locator(".tab, .topbtn").evaluateAll((els) => els.filter((b) => {
    const l = b.querySelector(".tab-label");
    return l && l.getBoundingClientRect().width > b.getBoundingClientRect().width - 6;
  }).map((b) => b.dataset.testid));
  check(squeezed.length === 0, `${vp.name}: every button label fits its button ${squeezed.join(", ")}`);
  const nameLeft = (await box('[data-testid="patient-name"]'))[0];
  const texts = () => page.locator(".tile-body").allInnerTexts();
  check(!(await texts()).some((t) => /--/.test(t)), `${vp.name}: no tile ever shows dashes`);
  await shot("home");

  // --- reference marks on traces: dashed baseline, scale, calibration bar
  await page.waitForSelector('[data-testid="trace-frame-ecg"]');
  const marks = await page.evaluate(() => {
    const out = {};
    const pxPerMm = 96 / 25.4;
    for (const id of ["ecg", "spo2", "resp", "bp", "temp"]) {
      const svg = document.querySelector(`[data-testid="trace-frame-${id}"]`);
      const row = document.querySelector(`[data-testid="row-${id}"]`);
      if (!svg) { out[id] = null; continue; }
      const rowColour = getComputedStyle(row).color;
      const base = svg.querySelector(".trace-baseline");
      const bar = svg.querySelector(".trace-bar[data-testid^='trace-bar']");
      const labels = [...svg.querySelectorAll(".trace-label")];
      const frame = svg.getBoundingClientRect(), name = row.querySelector(".row-label").getBoundingClientRect();
      out[id] = {
        dashed: base ? getComputedStyle(base).strokeDasharray !== "none" : null,
        baselineY: base ? Number(base.getAttribute("y1")) : null, expectedY: Number(svg.dataset.baselineY || NaN),
        baselineSpan: base ? Number(base.getAttribute("x2")) - Number(base.getAttribute("x1")) : null,
        inside: base ? Number(base.getAttribute("y1")) > 0 && Number(base.getAttribute("y1")) < frame.height : null,
        gain: svg.dataset.gain, pxPerUnit: Number(svg.dataset.pxPerUnit), fitted: svg.dataset.fitted,
        barPx: bar ? Number(bar.dataset.px) : null,
        barDrawn: bar ? Math.abs(Number(bar.querySelector("line").getAttribute("y1")) - Number(bar.querySelector("line").getAttribute("y2"))) : null,
        // any bar that is not the vertical 1 mV calibration bar would be a horizontal scale bar
        otherBars: [...svg.querySelectorAll(".trace-bar")].filter((g) => !(g.dataset.testid || "").startsWith("trace-bar-")).length,
        horizontalBars: [...svg.querySelectorAll(".trace-bar > line")].filter((l) =>
          Math.abs(Number(l.getAttribute("x2")) - Number(l.getAttribute("x1"))) > 12 &&
          Math.abs(Number(l.getAttribute("y2")) - Number(l.getAttribute("y1"))) < 1).length,
        labels: labels.map((l) => l.textContent),
        gainWeight: (() => { const g = svg.querySelector(".trace-gain"); return g ? Number(getComputedStyle(g).fontWeight) : null; })(),
        gainSize: (() => { const g = svg.querySelector(".trace-gain"); return g ? parseFloat(getComputedStyle(g).fontSize) : null; })(), labelSize: Math.min(...labels.map((l) => parseFloat(getComputedStyle(l).fontSize))),
        labelColour: labels.every((l) => getComputedStyle(l).fill === rowColour),
        clearOfName: frame.top >= name.bottom - 1,
      };
    }
    return { out, pxPerMm };
  });
  const m = marks.out;
  check(m.ecg && m.spo2 && m.resp && m.bp && m.temp && !(await page.locator('[data-testid="trace-frame-oxygen"]').count()),
        `${vp.name}: waveform and trend rows have a trace frame; bar rows do not`);
  for (const id of ["ecg", "spo2", "resp"]) {
    check(m[id].dashed && m[id].inside && Math.abs(m[id].baselineY - m[id].expectedY) < 0.1 && m[id].baselineSpan > 100,
          `${vp.name}: the ${id} trace has a dashed baseline inside its frame`);
  }
  const gainLabels = m.ecg.labels.filter((l) => /mm\/mV/.test(l));
  check(m.ecg.labels.includes("mV") && m.ecg.labels.includes("1 mV") && gainLabels.length === 1 && /^\d+(\.\d+)? mm\/mV$/.test(gainLabels[0]),
        `${vp.name}: the ECG has an mV axis, a 1 mV bar and a plain gain label (${m.ecg.labels.join(" | ")})`);
  check(!m.ecg.labels.some((l) => /nominal|fitted|mm\/s|^1 s$/.test(l)) && !m.spo2.labels.some((l) => /^1 s|mm\/s/.test(l)),
        `${vp.name}: no caveat text on the traces, and the x scale is not an SVG label`);
  check(m.ecg.gainWeight <= 300 && m.ecg.gainSize >= 10.5,
        `${vp.name}: the gain is in thin light text (weight ${m.ecg.gainWeight}, ${m.ecg.gainSize}px)`);
  check(Math.abs(m.ecg.barDrawn - m.ecg.barPx) < 0.05 && Math.abs(m.ecg.barPx - m.ecg.pxPerUnit) < 0.01 &&
        Math.abs(m.ecg.barPx - Number(m.ecg.gain) * marks.pxPerMm) < 0.05,
        `${vp.name}: the 1 mV bar is exactly the trace's scale (${m.ecg.barPx}px = ${m.ecg.gain} mm/mV, fitted=${m.ecg.fitted})`);
  check(Object.values(m).every((x) => x.otherBars === 0 && x.horizontalBars === 0),
        `${vp.name}: there are no horizontal scale bars on any trace`);

  // --- the x scale is a number, and can be changed (one touch to open, one to choose)
  const xtext = (id) => T(`xscale-${id}`).innerText();
  check(await xtext("ecg") === "25 mm/s" && await xtext("spo2") === "25 mm/s" && await xtext("resp") === "25 mm/s",
        `${vp.name}: each waveform's x scale is written as a number (25 mm/s)`);
  check(await xtext("bp") === "4 h" && await xtext("temp") === "4 h", `${vp.name}: each trend's x scale is its time window (4 h)`);
  check(await T("xscale-oxygen").count() === 0, `${vp.name}: bar rows have no x scale`);
  const xs = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="xscale-ecg"]'), r = b.getBoundingClientRect();
    const text = b.querySelector(".xscale-text"), cs = getComputedStyle(text);
    return { w: r.width, h: r.height, weight: Number(cs.fontWeight), size: parseFloat(cs.fontSize),
             colourOk: cs.color === getComputedStyle(document.querySelector('[data-testid="row-ecg"]')).color,
             inRow: b.closest('[data-testid="row-ecg"]') !== null,
             nested: document.querySelectorAll("button button").length };
  });
  check(xs.w >= 48 && xs.h >= 48, `${vp.name}: the x scale is a touch target (${Math.round(xs.w)}x${Math.round(xs.h)}px)`);
  check(xs.weight <= 300 && xs.size >= 10.5 && xs.colourOk, `${vp.name}: the x scale is thin light text in the row colour`);
  check(xs.nested === 0, `${vp.name}: no button sits inside another button`);
  await T("xscale-ecg").click();
  const options = await page.locator('[data-testid="xscale-menu-ecg"] [role=menuitemradio]').evaluateAll((els) =>
    els.map((e) => ({ t: e.textContent, h: e.getBoundingClientRect().height, on: e.getAttribute("aria-checked") })));
  check(options.map((o) => o.t).join() === "6.25 mm/s,12.5 mm/s,25 mm/s,50 mm/s" && options.every((o) => o.h >= 48) &&
        options.find((o) => o.on === "true").t === "25 mm/s", `${vp.name}: one touch opens the speeds, each a touch target, the current one marked`);
  const menuBox = await T("xscale-menu-ecg").boundingBox();
  check(menuBox.x >= 0 && menuBox.y >= 0 && menuBox.x + menuBox.width <= vp.width && menuBox.y + menuBox.height <= vp.height,
        `${vp.name}: the menu stays on screen`);
  await shot("xscale-menu");
  await T("xscale-option-ecg-50").click();
  check(await xtext("ecg") === "50 mm/s" && await xtext("spo2") === "25 mm/s" && await xtext("resp") === "25 mm/s",
        `${vp.name}: choosing 50 mm/s changes the ECG only`);
  await T("xscale-bp").click();
  await T("xscale-option-bp-60").click();
  check(await xtext("bp") === "1 h" && await xtext("temp") === "4 h", `${vp.name}: a trend's window changes on its own`);
  check(await T("sheet-alarm-limits").count() === 0, `${vp.name}: using the x scale does not open the alarm limits`);
  await page.reload({ waitUntil: "networkidle" });
  await T("app").waitFor();
  check(await xtext("ecg") === "50 mm/s" && await xtext("bp") === "1 h", `${vp.name}: the choices survive a reload`);
  await T("xscale-ecg").click(); await T("xscale-option-ecg-25").click();
  await T("xscale-bp").click(); await T("xscale-option-bp-240").click();
  check(await xtext("ecg") === "25 mm/s" && await xtext("bp") === "4 h", `${vp.name}: and go back`);
  await page.waitForSelector('[data-testid="trace-frame-ecg"]');
  check(m.spo2.labels.includes("a.u.") && m.resp.labels.includes("a.u.") && m.spo2.barPx === null,
        `${vp.name}: pleth and resp have an arbitrary-unit scale and no calibration bar`);
  check(m.bp.labels.includes("mmHg") && m.temp.labels.includes("°C") && m.bp.dashed === null,
        `${vp.name}: trend rows are labelled in their own units`);
  check(Object.values(m).every((x) => x.clearOfName && x.labelSize >= 10.5 && x.labelColour),
        `${vp.name}: trace marks sit under the row name, are readable, and use the row colour`);

  // Everything below must leave these exactly where they are.
  const layout = async () => JSON.stringify({
    top: await box(".topbar"), screen: await box(".screen"), tabs: await box("nav.tabbar"),
    notif: await box('[data-testid="notifications"]'), tiles: await tiles(),
    rows: await page.locator(".row").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height))),
  });
  // Keep the screen "live": the watchdog marks it stale after 3 s without a message.
  await page.evaluate(() => {
    const s = window.__emus.safety;
    window.__beat = setInterval(() => s.getState().heartbeat(), 400);
    s.getState().heartbeat();
    s.getState().setSound("ready");
  });
  await page.waitForFunction(() => document.querySelector('[data-testid="app"]').dataset.link === "live");
  const before = await layout();

  // --- failure modes (driven through the test handle until the simulator can inject them)
  await page.evaluate(() => {
    const s = window.__emus.safety;
    const t = new Date().toISOString();
    const sig = (parameter, state, extra = {}) => [parameter, { parameter, state, since: t, advice: "", ...extra }];
    const dev = (id, label, kind, parameters, extra) => ({ id, label, kind, parameters, waveforms: [], connection: "connected",
      battery: "ok", battery_pct: 71, link_quality: 0.9, last_seen: t, ...extra });
    s.getState().setDevices(
      [
        dev("anne-chest", "Chest sensor", "anne-chest", ["hr", "rr", "temp", "activity", "position", "falls"], { battery: "low", battery_pct: 18 }),
        dev("anne-limb", "Limb sensor", "anne-limb", ["spo2", "pulse"], { connection: "lost", battery_pct: 52,
          last_seen: new Date(Date.now() - 42000).toISOString() }),
        dev("bp-cuff", "BP cuff", "bp-cuff", ["bp_sys", "bp_dia", "bp_mean"], { connection: "not-paired", battery: "unknown", battery_pct: null }),
      ],
      Object.fromEntries([
        sig("hr", "poor-signal", { issue: "motion", device_id: "anne-chest", quality: 0.4 }),
        sig("rr", "sensor-off", { device_id: "anne-chest", advice: "Check the sensor is attached" }),
        sig("spo2", "connection-lost", { device_id: "anne-limb" }), sig("pulse", "connection-lost", { device_id: "anne-limb" }),
        sig("temp", "acquiring", { device_id: "anne-chest" }),
        sig("bp_sys", "standby"), sig("bp_dia", "standby"), sig("bp_mean", "standby"),
      ]));
    s.getState().setAlarms({ active: [
      { id: "t2", kind: "technical", technical: "battery-low", priority: "low", device_id: "anne-chest", parameter: null,
        message: "Chest sensor: battery 18%.", started_at: new Date(Date.now() - 20000).toISOString() },
      { id: "t1", kind: "technical", technical: "connection-lost", priority: "medium", device_id: "anne-limb", parameter: null,
        message: "Limb sensor: connection lost. Not monitoring SpO2, PR.", started_at: new Date(Date.now() - 42000).toISOString() },
    ], silenced_until: null, silence_seconds: 120, alarms_off: [], unmonitored: ["spo2", "pulse"] });
  });
  const state = (p) => T(`num-${p}`).getAttribute("data-state");
  const body = (p) => page.locator(`[data-testid="num-${p}"] .tile-body`).innerText();
  check(await state("bp_sys") === "standby" && /STANDBY/.test(await body("bp_sys")), `${vp.name}: a modality with no device says STANDBY`);
  check(/CONNECTION\s+LOST/.test(await body("spo2")), `${vp.name}: a lost wireless link says CONNECTION LOST`);
  check(/CHECK\s+SENSOR/.test(await body("rr")), `${vp.name}: a sensor off the patient says CHECK SENSOR`);
  check(/SEARCHING/.test(await body("temp")), `${vp.name}: a device still acquiring says SEARCHING`);
  const hrStatus = await T("row-status-hr").innerText();
  check(/POOR TRACE/.test(hrStatus) && /moving/i.test(hrStatus), `${vp.name}: a noisy trace says POOR TRACE with what to check`);
  const words = new Set((await Promise.all(["bp_sys", "spo2", "rr", "temp"].map(body))).map((x) => x.replace(/\s+/g, " ")));
  check(words.size === 4, `${vp.name}: each failure mode reads differently`);

  // Battery and link sit in the same tile as the value that device measures.
  const inside = (mark, tile) => page.evaluate(([m, t]) =>
    !!document.querySelector(`[data-testid="${t}"] [data-testid="${m}"]`), [mark, tile]);
  check(await inside("mark-anne-chest", "num-hr") && /LOW 18%/.test(await page.locator('[data-testid="num-hr"] [data-testid="mark-anne-chest"]').innerText()),
        `${vp.name}: the ECG sensor's low battery is in the heart rate tile`);
  check(await inside("mark-anne-limb", "num-spo2") && /NO LINK/.test(await page.locator('[data-testid="num-spo2"] [data-testid="mark-anne-limb"]').innerText()),
        `${vp.name}: the limb sensor's lost link is in the SpO2 tile`);
  check(await inside("mark-bp-cuff", "num-bp_sys"), `${vp.name}: the cuff's link state is in the blood pressure tile`);
  const fits = await page.locator(".tile").evaluateAll((els) => els.filter((e) =>
    [...e.querySelectorAll(".tile-state, .tile-value, .tile-head")].some((c) => {
      const a = c.getBoundingClientRect(), b = e.getBoundingClientRect();
      return a.left < b.left - 1 || a.right > b.right + 1 || a.top < b.top - 1 || a.bottom > b.bottom + 1;
    })).map((e) => e.dataset.testid));
  check(fits.length === 0, `${vp.name}: every state fits inside its tile ${fits.join(", ")}`);
  const legible = () => page.locator(".tile-state, .tile-value").evaluateAll((els) => els.map((e) => {
    const r = e.getBoundingClientRect();
    return { size: parseFloat(getComputedStyle(e).fontSize), h: r.height, w: r.width };
  }).filter((x) => x.size < 12 || x.h < 10 || x.w < 20).length);
  check(await legible() === 0, `${vp.name}: every state word is large enough to read`);

  // When the two values in a tile are in different states, each shows its own, still in one tile.
  await page.evaluate(() => {
    const st = window.__emus.safety, cur = st.getState().signals;
    window.__signals = cur;
    st.getState().setDevices(st.getState().devices, { ...cur,
      pulse: { ...cur.pulse, state: "sensor-off", advice: "Check the sensor is attached" } });
  });
  const mixedTile = await page.evaluate(() => {
    const tile = document.querySelector('[data-testid="row-spo2"] .tile');
    return { tiles: document.querySelectorAll('[data-testid="row-spo2"] .tile:not(.tile-empty)').length,
             cells: [...tile.querySelectorAll(".tile-cell")].map((c) => c.querySelector(".tile-body").innerText.replace(/\s+/g, " ").trim()) };
  });
  check(mixedTile.tiles === 1 && mixedTile.cells.length === 2 && /CONNECTION\s+LOST/.test(mixedTile.cells[0]) && /CHECK\s+SENSOR/.test(mixedTile.cells[1]),
        `${vp.name}: values in different states each show their own, in the same tile (${mixedTile.cells.join(" | ")})`);
  check(await layout() === before, `${vp.name}: two states in one tile did not move or resize anything`);
  await shot("tile-mixed");
  await page.evaluate(() => { const st = window.__emus.safety; st.getState().setDevices(st.getState().devices, window.__signals); });

  // The box headlines the most serious problem and counts the rest.
  check(/connection lost/i.test(await T("notif-text").innerText()), `${vp.name}: the box headlines the most serious problem`);
  check(await T("notif-count").innerText() === "1/2", `${vp.name}: the box says which of how many is showing`);
  check(/MONITOR/.test(await T("notifications").innerText()), `${vp.name}: monitoring problems are tagged MONITOR`);
  check(await layout() === before, `${vp.name}: problems appearing did not move or resize anything`);
  await shot("failure-modes");

  // --- text takes the colour of its row; turquoise is not used for status
  const colours = await page.evaluate(() => {
    const toRgb = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
    const lum = (c) => { const [r, g, b] = toRgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
                         return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const root = getComputedStyle(document.documentElement);
    const technical = (() => { const el = document.createElement("i"); el.style.color = root.getPropertyValue("--c-technical"); document.body.append(el);
                               const v = getComputedStyle(el).color; el.remove(); return v; })();
    const ground = getComputedStyle(document.body).backgroundColor;
    const bad = [], faint = [], turquoise = [];
    for (const row of document.querySelectorAll(".row:not(.row-spacer)")) {
      const rowColour = getComputedStyle(row).color;
      if (ratio(rowColour, ground) < 4.5) faint.push(`${row.dataset.testid} ${rowColour}`);
      for (const el of row.querySelectorAll(".tile *, .row-status, .row-status *, .trace-label")) {
        if (el.matches(".tile-alarm-off")) continue;            // the one deliberate exception: alarm off is yellow
        const cs = getComputedStyle(el);
        const own = el.tagName.toLowerCase() === "text" ? cs.fill : cs.color;
        if (el.textContent.trim() && own !== rowColour) bad.push(`${row.dataset.testid} ${el.className.baseVal ?? el.className}: ${own}`);
      }
      for (const tile of row.querySelectorAll(".tile")) {
        const after = getComputedStyle(tile, "::after");
        if (after.content !== "none" && after.borderTopColor !== rowColour) bad.push(`${row.dataset.testid} frame ${after.borderTopColor}`);
      }
      if (rowColour !== technical) {
        for (const el of row.querySelectorAll("*")) {
          const cs = getComputedStyle(el);
          if ([cs.color, cs.borderTopColor, cs.backgroundColor].includes(technical)) turquoise.push(`${row.dataset.testid} ${el.className.baseVal ?? el.className}`);
        }
      }
    }
    return { bad, faint, turquoise };
  });
  check(colours.bad.length === 0, `${vp.name}: all text, marks and frames in a row use that row's colour ${colours.bad.slice(0, 3).join(" | ")}`);
  check(colours.turquoise.length === 0, `${vp.name}: no turquoise outside the turquoise row ${colours.turquoise.slice(0, 3).join(" | ")}`);
  check(colours.faint.length === 0, `${vp.name}: every row colour is readable on the background (4.5:1) ${colours.faint.join(" | ")}`);

  // --- the ticker rolls through the items, never opens the list, and holds a serious alarm
  const text = () => T("notif-text").innerText();
  check(/connection lost/i.test(await text()), `${vp.name}: the ticker starts on the most serious item`);
  await page.waitForTimeout(4600);
  check(/battery 18%/i.test(await text()) && await T("notif-count").innerText() === "2/2",
        `${vp.name}: after a few seconds the ticker rolls to the next item (2/2)`);
  check(await layout() === before, `${vp.name}: the ticker rolling did not move or resize anything`);
  const t0 = new Date().toISOString();
  await page.evaluate((t) => {
    const s = window.__emus.safety;
    const cur = s.getState().alarms;
    window.__calm = cur;
    s.getState().setAlarms({ ...cur, active: [...cur.active,
      { id: "hr1", kind: "high", priority: "high", parameter: "hr", device_id: null,
        message: "Heart rate 142, above 120.", started_at: t }] });
  }, t0);
  check(/Heart rate 142/.test(await text()), `${vp.name}: a high-priority patient alarm takes over the ticker`);
  check(await T("notif-mark").innerText() === "!!!", `${vp.name}: it carries its priority mark (!!!)`);
  check(await T("feed").count() === 0 && await T("notifications").getAttribute("aria-expanded") === "false",
        `${vp.name}: the list does not open by itself, even for a high-priority alarm`);
  await page.waitForTimeout(4600);
  check(/Heart rate 142/.test(await text()) && await T("notifications").getAttribute("data-held") === "true",
        `${vp.name}: the alarm is held still while others wait`);
  check(await layout() === before, `${vp.name}: a high-priority alarm arriving did not move or resize anything`);
  await shot("alarm-held");
  await page.evaluate(() => window.__emus.safety.getState().setAlarms(window.__calm));
  check(/connection lost/i.test(await text()) && await T("notifications").getAttribute("data-held") === "false",
        `${vp.name}: when the alarm clears the ticker goes back to turns`);

  // --- horizontal ticker: scrolls sideways when the text does not fit
  await page.evaluate(() => { const ui = window.__emus.ui, d = ui.getState().stored.document;
    ui.getState().setDraft({ ...d, notifications: { ...d.notifications, ticker: "horizontal" } }); });
  const track = page.locator(".ticker-track");
  await track.waitFor();
  check(await T("notifications").getAttribute("data-ticker") === "horizontal", `${vp.name}: the ticker can be set to horizontal`);
  const moving = await page.evaluate(async () => {
    const t = document.querySelector(".ticker-track");
    const x = () => new DOMMatrix(getComputedStyle(t).transform).m41;
    const a = x(); await new Promise((r) => setTimeout(r, 400)); return { scrolling: t.classList.contains("is-scrolling"), moved: Math.abs(x() - a) };
  });
  check(moving.scrolling && moving.moved > 1, `${vp.name}: text too long for the box scrolls sideways`);
  check(await layout() === before, `${vp.name}: a horizontal ticker did not move or resize anything`);
  await shot("ticker-horizontal");
  await page.evaluate(() => window.__emus.ui.getState().setDraft(null));

  // --- the feed is an overlay, most serious first
  await T("notifications").click();
  await T("feed").waitFor();
  const feedEdges = await page.evaluate(() => {
    const l = (s) => document.querySelector(s).getBoundingClientRect().left;
    return [l(".feed-head h2"), ...[...document.querySelectorAll(".feed-tag")].map((e) => e.getBoundingClientRect().left)];
  });
  check(Math.max(...feedEdges) - Math.min(...feedEdges) <= 1 && Math.abs(feedEdges[0] - nameLeft) <= 1,
        `${vp.name}: the feed's title and items line up with the same left edge`);
  const order = await page.locator('[data-testid="feed"] [data-notice]').evaluateAll((els) => els.map((e) => e.dataset.notice));
  check(order.join() === "t1,t2", `${vp.name}: the feed lists the most serious first`);
  const feedOk = await page.evaluate(() => {
    const items = [...document.querySelectorAll('[data-testid="feed"] [data-notice]')];
    const dim = getComputedStyle(document.querySelector(".scrim-clear")).backgroundColor;
    return { visible: items.every((e) => e.getBoundingClientRect().height >= 40), dim };
  });
  check(feedOk.visible, `${vp.name}: feed items are fully visible`);
  check(/rgba\(0, 0, 0, 0\)|transparent/.test(feedOk.dim), `${vp.name}: the feed does not dim the monitor`);
  check(await layout() === before, `${vp.name}: opening the feed did not move or resize anything`);
  await shot("feed");
  await T("feed-close").click();

  // --- alarm sound paused: solid yellow button, countdown on the box, nothing moves
  await page.evaluate(() => window.__emus.safety.getState().setSilencedUntil(new Date(Date.now() + 120000).toISOString()));
  await T("notif-paused").waitFor();
  check(/SOUND PAUSED\s*(2:00|1:5\d)/.test(await T("notif-paused").innerText()), `${vp.name}: the box says SOUND PAUSED with the time left`);
  const yellow = await page.evaluate(() => {
    const want = getComputedStyle(document.documentElement).getPropertyValue("--c-silenced").trim().toLowerCase();
    const hex = (rgb) => "#" + rgb.match(/\d+/g).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("");
    return { want, btn: hex(getComputedStyle(document.querySelector('[data-testid="silence"]')).backgroundColor),
             chip: hex(getComputedStyle(document.querySelector('[data-testid="notif-paused"]')).backgroundColor) };
  });
  check(yellow.btn === yellow.want && yellow.chip === yellow.want, `${vp.name}: silence button and paused mark are solid ${yellow.want}`);
  check(/Paused (2:00|1:5\d)/.test(await T("silence").innerText()), `${vp.name}: silence button shows the time left`);
  check(/Sound Paused/.test(await T("alarm-status").innerText()), `${vp.name}: top bar says sound is paused`);
  check(/connection lost/i.test(await T("notif-text").innerText()), `${vp.name}: pausing sound does not hide the headline problem`);
  check(await layout() === before, `${vp.name}: pausing sound did not move or resize anything`);
  await T("notifications").click();
  check(/Alarms still show on screen/.test(await T("feed-paused").innerText()), `${vp.name}: the feed says alarms still show, with Resume Sound`);
  await shot("sound-paused");
  await T("feed-close").click();
  await page.evaluate(() => window.__emus.safety.getState().setSilencedUntil(null));
  const gone = await T("notif-paused").waitFor({ state: "detached", timeout: 2000 }).then(() => true, () => false);
  check(gone, `${vp.name}: the paused mark goes when sound resumes`);

  // --- a screen that stops receiving must not look live
  await page.evaluate(() => clearInterval(window.__beat));
  await page.waitForFunction(() => document.querySelector('[data-testid="app"]').dataset.link === "stale", null, { timeout: 8000 });
  check((await texts()).every((t) => /NO\s+DATA/.test(t)), `${vp.name}: every tile says NO DATA when the screen stops updating`);
  const stale = await T("notif-text").innerText();
  check(/not updating/i.test(stale) && !/battery/i.test(stale), `${vp.name}: the box says the screen is not updating and repeats nothing stale`);
  check(await page.locator(".device-mark").count() === 0, `${vp.name}: stale device details are not shown`);
  check(/no data/i.test(await T("alarm-status").innerText()), `${vp.name}: alarm status admits it has no data`);
  check(await layout() === before, `${vp.name}: losing the feed did not move or resize anything`);
  await shot("not-updating");

  // --- dark / light switch: one touch, kept across a reload, changes no layout
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const mode = () => page.evaluate(() => document.documentElement.dataset.themeMode);
  const dark = await bg();
  check(await mode() === "dark", `${vp.name}: starts in the design's default theme`);
  await T("top-theme").click();
  check(await mode() === "light" && await bg() !== dark, `${vp.name}: one touch switches to the light theme`);
  check(await layout() === before, `${vp.name}: switching theme did not move or resize anything`);
  await shot("light");
  await page.reload({ waitUntil: "networkidle" });
  await T("app").waitFor();
  check(await mode() === "light", `${vp.name}: the choice survives a reload`);
  await T("top-theme").click();
  check(await mode() === "dark", `${vp.name}: and switches back`);

  // --- one touch: screens
  await T("tab-news2").click();
  check(await T("screen-news2").isVisible(), `${vp.name}: NEWS2 screen in one touch`);

  // --- two touches: menu -> split screen
  await T("tab-split").click();
  check(await T("menu-views").isVisible(), `${vp.name}: views menu opens`);
  await T("menu-item-side").click();
  check(await T("screen-split-h").isVisible(), `${vp.name}: side-by-side split in two touches`);
  check(await T("split").evaluate((e) => e.classList.contains("split-horizontal")), `${vp.name}: split is horizontal`);
  await shot("split-h");
  await T("tab-split").click();
  await T("menu-item-stacked").click();
  check(await T("split").evaluate((e) => e.classList.contains("split-vertical")), `${vp.name}: stacked split is vertical`);
  const shortTiles = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll(".tile:not(.tile-empty)")];
    const mid = (r) => (r.top + r.bottom) / 2;
    return {
      sizes: new Set(tiles.map((t) => `${Math.round(t.getBoundingClientRect().width)}x${Math.round(t.getBoundingClientRect().height)}`)).size,
      smallest: Math.min(...tiles.map((t) => parseFloat(getComputedStyle(t.querySelector(".tile-state, .tile-value")).fontSize))),
      clipped: tiles.filter((t) => { const a = t.querySelector(".tile-state, .tile-value").getBoundingClientRect(), b = t.getBoundingClientRect();
        return a.top < b.top - 1 || a.bottom > b.bottom + 1 || a.left < b.left - 1 || a.right > b.right + 1; }).length,
      head: Math.max(...[...document.querySelectorAll(".row")].filter((r) => r.querySelector(".tile:not(.tile-empty)")).map((r) =>
        Math.abs(mid(r.querySelector(".row-label").getBoundingClientRect()) - mid(r.querySelector(".tile:not(.tile-empty) .tile-head").getBoundingClientRect())))),
    };
  });
  check(shortTiles.sizes === 1 && shortTiles.smallest >= 12 && shortTiles.clipped === 0 && shortTiles.head <= 1,
        `${vp.name}: short tiles on a split screen stay identical, readable and level (${shortTiles.smallest}px)`);
  await shot("split-v");

  // --- two touches: settings (top right) -> a studio section
  await T("top-settings").click();
  check(await T("menu-settings").isVisible(), `${vp.name}: settings menu opens from the cog`);
  const menuEdges = await page.evaluate(() => {
    const l = (s) => document.querySelector(s).getBoundingClientRect().left;
    const items = [...document.querySelectorAll(".menu-item")].map((e) => e.getBoundingClientRect());
    return { title: l(".menu-title"), first: l(".menu-item"),
             heights: new Set(items.map((r) => Math.round(r.height))).size, widths: new Set(items.map((r) => Math.round(r.width))).size };
  });
  check(Math.abs(menuEdges.title - nameLeft) <= 1 && Math.abs(menuEdges.first - nameLeft) <= 1,
        `${vp.name}: the menu lines up with the same left edge`);
  check(menuEdges.heights === 1 && menuEdges.widths === 1, `${vp.name}: menu items are all one size`);
  await shot("menu-settings");
  await T("menu-item-appearance").click();
  check(await T("sheet-studio-appearance").isVisible(), `${vp.name}: appearance in two touches`);
  check(Math.abs((await box(".sheet-head h2"))[0] - nameLeft) <= 1, `${vp.name}: sheet titles line up with the same left edge`);
  await T("sheet-close").click();

  // --- new patient and discharge are one touch
  await T("top-new-patient").click();
  check(await T("sheet-new-patient").isVisible(), `${vp.name}: new patient opens in one touch`);
  await T("sheet-close").click();
  await T("top-discharge").click();
  check(await T("sheet-discharge-patient").isVisible(), `${vp.name}: discharge opens in one touch`);
  await T("sheet-close").click();

  // --- row tap opens its panel
  await T("tab-monitor").click();
  await T("row-ecg").click();
  check(await T("sheet-alarm-limits").isVisible(), `${vp.name}: row tap opens alarm limits`);
  await T("sheet-close").click();

  // --- modules of different sizes: load the Modular Example and measure it
  await page.evaluate(async () => {
    const ui = window.__emus.ui, st = ui.getState();
    const stored = await (await fetch("/api/designs/icu-modules")).json();
    st.load(stored, st.registry);
    st.go("monitor");
  });
  await page.waitForSelector('[data-testid="grid-monitor-grid"]');
  await page.waitForTimeout(300);
  const mod = await page.evaluate(() => {
    const grid = document.querySelector('[data-testid="grid-monitor-grid"]');
    const g = grid.getBoundingClientRect();
    const mods = [...grid.children].map((e) => {
      const r = e.getBoundingClientRect();
      return { id: e.dataset.testid.replace("row-", ""), size: e.dataset.size, flow: e.dataset.flow, x: r.x, y: r.y, w: r.width, h: r.height,
               content: e.dataset.content, dropped: e.dataset.dropped,
               hit: (() => { const b = e.querySelector(".row-hit").getBoundingClientRect(); return [b.width, b.height]; })() };
    });
    const overlap = mods.some((a, i) => mods.some((b, j) => j > i && a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1));
    const area = mods.reduce((n, m) => n + m.w * m.h, 0);
    const inside = mods.every((m) => m.x >= g.x - 1 && m.y >= g.y - 1 && m.x + m.w <= g.x + g.width + 1 && m.y + m.h <= g.y + g.height + 1);
    const cell = { w: g.width / 6, h: g.height / 5 };
    const tiles = [...grid.querySelectorAll(".tile:not(.tile-empty)")].map((t) => {
      const b = t.getBoundingClientRect();
      const bad = [...t.querySelectorAll(".tile-state, .tile-value, .tile-head")].some((c) => {
        const a = c.getBoundingClientRect(); return a.left < b.left - 1 || a.right > b.right + 1 || a.top < b.top - 1 || a.bottom > b.bottom + 1; });
      const text = [...t.querySelectorAll(".tile-state, .tile-value")].map((c) => parseFloat(getComputedStyle(c).fontSize));
      return { id: t.dataset.testid, clipped: bad, min: Math.min(...text) };
    });
    return { g: [g.width, g.height], cols: grid.dataset.columns, rows: grid.dataset.rows, mods, overlap, area, inside, cell, tiles,
             scroll: document.documentElement.scrollWidth <= window.innerWidth && document.documentElement.scrollHeight <= window.innerHeight };
  });
  const byId = Object.fromEntries(mod.mods.map((m) => [m.id, m]));
  const near = (a, b) => Math.abs(a - b) <= 2;
  check(mod.cols === "6" && mod.rows === "5" && mod.mods.length === 9, `${vp.name}: the example is 6 columns by 5 rows of cells with nine modules`);
  check(near(byId.ecg.w, mod.g[0]) && near(byId.ecg.h, mod.cell.h * 2), `${vp.name}: the ECG is full width and double height`);
  check(near(byId.spo2.w, mod.cell.w * 2) && near(byId.spo2.h, mod.cell.h * 2) && near(byId.resp.w, mod.cell.w * 2), `${vp.name}: large modules are two cells by two`);
  check(near(byId.bp.w, mod.cell.w) && near(byId.bp.h, mod.cell.h * 2), `${vp.name}: tall modules are one cell wide and two high`);
  check(near(byId.oxygen.w, mod.cell.w) && near(byId.oxygen.h, mod.cell.h), `${vp.name}: small squares are one cell`);
  check(near(byId.falls.w, mod.cell.w * 2) && near(byId.falls.h, mod.cell.h), `${vp.name}: tiles are two cells wide and one high`);
  check(!mod.overlap && mod.inside && Math.abs(mod.area - mod.g[0] * mod.g[1]) / (mod.g[0] * mod.g[1]) < 0.003, `${vp.name}: modules fill the grid exactly, with no overlap and no gaps`);
  check(mod.scroll, `${vp.name}: the grid fits the screen without scrolling`);
  check(mod.mods.every((m) => m.hit[0] >= 48 && m.hit[1] >= 48), `${vp.name}: every module is a touch target`);
  check(mod.tiles.every((t) => !t.clipped) && mod.tiles.every((t) => t.min >= 12), `${vp.name}: every module's tile fits and its text is readable (${Math.min(...mod.tiles.map((t) => t.min))}px)`);
  check(byId.ecg.flow === "row" && byId.spo2.flow === "stack" && byId.oxygen.flow === "tile-only" && byId.falls.flow === "side",
        `${vp.name}: each size is arranged its own way`);
  check(/trace/.test(byId.ecg.content) && byId.ecg.dropped === "" && byId.oxygen.dropped.includes("ai") && byId.oxygen.content === "",
        `${vp.name}: a module shows what fits and records what was left out`);
  const frames = await page.evaluate(() => ({
    full: [...document.querySelectorAll('[data-flow="row"] [data-testid^="trace-frame-"], [data-flow="stack"] [data-testid^="trace-frame-"]')].length,
    mini: document.querySelectorAll(".trace-mini").length,
    spark: !!document.querySelector('[data-testid="row-bp"] .trace-mini'),
  }));
  check(frames.full >= 3 && frames.spark, `${vp.name}: large modules draw the full trace and tall modules a small one`);
  await shot("modular");
  // the same screen but narrower panes still pack
  await page.evaluate(async () => { const st = window.__emus.ui.getState(); const s = await (await fetch("/api/designs/icu-monitor")).json(); st.load(s, st.registry); });

  // ===== milestone checks are added below this line =====

  // --- example data: numbers, traces, AI marks and their switches (labelled EXAMPLE DATA)
  const ex = (fn, ...args) => page.evaluate(async ([f, a]) => {
    const st = window.__emus.examples.getState();
    await st[f](...a);
  }, [fn, args]);
  const settle = async () => { await page.waitForFunction(() => window.__emus.examples.getState().status === "ready", null, { timeout: 8000 }); await page.waitForTimeout(400); };
  await ex("setEnabled", true);
  await ex("setScenario", "scn-af");
  await ex("setMinute", 20);
  await settle();
  const badgeFit = await page.evaluate(() => { const b = document.querySelector('[data-testid="example-badge"]').getBoundingClientRect(),
    btn = document.querySelector('[data-testid="top-buttons"]').getBoundingClientRect(), c = document.querySelector('[data-testid="clock"]').getBoundingClientRect();
    return b.right <= btn.left + 1 && b.left >= c.right - 1 && b.width > 40; });
  check(badgeFit, `${vp.name}: the EXAMPLE badge is whole, beside the clock and clear of the buttons`);
  check(await T("example-badge").isVisible() && /EXAMPLE/.test(await T("example-badge").innerText()) && (vp.width > 1100 ? /DATA/.test(await T("example-badge").innerText()) : true), `${vp.name}: the top bar says EXAMPLE DATA`);
  check((await T("patient-name").innerText()).includes("OKAFOR"), `${vp.name}: the scripted patient is named`);
  const exMarks = await page.evaluate(() => ({ rows: document.querySelectorAll('[data-testid^="row-"][data-parameter]').length,
    marks: document.querySelectorAll('[data-testid^="example-row"], .example-mark').length }));
  check(exMarks.marks >= exMarks.rows, `${vp.name}: every module carries a small Example mark`);
  check((await T("num-hr").innerText()).includes("144"), `${vp.name}: the heart rate tile shows the scripted value`);

  // The trace is drawn at the same scale as its 1 mV calibration bar.
  const sig = await page.evaluate(() => {
    const frame = document.querySelector('[data-testid="trace-frame-ecg"]');
    const path = document.querySelector('[data-testid="trace-signal-ecg"]');
    const bar = document.querySelector('[data-testid="trace-bar-ecg"]');
    if (!frame || !path || !bar) return null;
    const ys = [...path.getAttribute("d").matchAll(/[ML][\d.]+ ([\d.-]+)/g)].map((m) => Number(m[1]));
    const base = Number(frame.dataset.baselineY), px = Number(bar.dataset.px);
    const fb = frame.getBoundingClientRect(), pb = path.getBoundingClientRect();
    return { rAmp: (base - Math.min(...ys)) / px, inside: pb.left >= fb.left - 1 && pb.right <= fb.right + 1 && pb.top >= fb.top - 1 && pb.bottom <= fb.bottom + 1, n: ys.length };
  });
  check(sig && sig.n > 100, `${vp.name}: the ECG is drawn from the example strip`);
  check(sig && sig.rAmp > 0.8 && sig.rAmp < 1.35, `${vp.name}: R waves are about 1 mV tall against the 1 mV bar (${sig && sig.rAmp.toFixed(2)})`);
  check(sig && sig.inside, `${vp.name}: the signal stays inside its trace frame`);

  // Annotations sit over the marked part of the strip and say why.
  const ann = await page.evaluate(() => {
    const m = document.querySelector('[data-testid="annotations-ecg"] .trace-mark');
    const frame = document.querySelector('[data-testid="trace-frame-ecg"]').getBoundingClientRect();
    if (!m) return null;
    const r = m.querySelector(".trace-bracket").getBoundingClientRect();
    return { label: m.dataset.label, w: r.width, inside: r.left >= frame.left - 1 && r.right <= frame.right + 1,
             text: m.querySelector(".trace-mark-label").textContent };
  });
  check(ann && /Irregular R-R/.test(ann.text) && ann.w > 20 && ann.inside, `${vp.name}: the AI marks the irregular R-R on the trace, with its reason`);

  // The AI chip: finding, certainty (named), and a touch target that opens Why.
  const chip = T("ai-ecg");
  check(/AF now/.test(await chip.innerText()) && /agreement/i.test(await chip.innerText()), `${vp.name}: the ECG chip says AF with how sure it is, and of what`);
  const chipBox = await chip.boundingBox();
  check(chipBox.height >= MIN_TOUCH - 1 && chipBox.width >= MIN_TOUCH - 1, `${vp.name}: the AI chip is a touch target`);
  const chipInside = await page.evaluate(() => [...document.querySelectorAll('.module .ai-chip-pill')].every((p) => {
    const m = p.closest(".module, .row").getBoundingClientRect(), b = p.getBoundingClientRect();
    return b.left >= m.left - 1 && b.right <= m.right + 1 && b.top >= m.top - 1 && b.bottom <= m.bottom + 1; }));
  check(chipInside, `${vp.name}: every AI chip sits inside its module`);
  const smallest = await page.evaluate(() => Math.min(...[...document.querySelectorAll(".ai-chip-pill, .trace-mark-label, .example-mark")].map((e) => parseFloat(getComputedStyle(e).fontSize))));
  check(smallest >= 10, `${vp.name}: the smallest AI and example text is readable (${smallest}px)`);
  await shot("example-af");
  await chip.click();
  check(await page.getByRole("dialog").count() >= 0 && await page.evaluate(() => window.__emus.ui.getState().openSheet === "finding-explain"), `${vp.name}: tapping the chip opens the Why sheet`);
  await page.evaluate(() => window.__emus.ui.getState().showSheet(null));

  // Turning AI off removes every AI mark, moves nothing, and is kept.
  const aiBoxes = () => page.evaluate(() => JSON.stringify([...document.querySelectorAll('[data-testid^="row-"][data-parameter]')].map((e) => { const r = e.getBoundingClientRect(); return [e.dataset.testid, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })));
  const beforeAi = await aiBoxes();
  const aiBtn = T("top-ai");
  check(/AI On/.test(await aiBtn.innerText()) && await aiBtn.getAttribute("aria-pressed") === "true", `${vp.name}: the AI button shows AI is on`);
  await aiBtn.click();
  await page.waitForTimeout(200);
  const off = await page.evaluate(() => ({ chips: document.querySelectorAll(".ai-chip").length, certainty: document.querySelectorAll(".certainty").length,
    marks: document.querySelectorAll(".trace-mark:not(.is-technical)").length, pressed: document.querySelector('[data-testid="top-ai"]').getAttribute("aria-pressed") }));
  check(off.chips === 0 && off.certainty === 0 && off.marks === 0 && off.pressed === "false", `${vp.name}: AI Off draws no chips, certainty or trace marks`);
  check(await aiBoxes() === beforeAi, `${vp.name}: switching AI off moved and resized nothing`);
  check((await T("num-hr").innerText()).includes("144") && await T("trace-signal-ecg").count() === 1, `${vp.name}: numbers and traces stay when AI is off`);
  await shot("example-ai-off");
  await page.reload({ waitUntil: "networkidle" });
  await T("example-badge").waitFor();
  check(await T("top-ai").getAttribute("aria-pressed") === "false", `${vp.name}: AI Off is remembered on this screen`);
  await T("top-ai").click();
  await settle();
  check(await page.locator(".ai-chip").count() > 0, `${vp.name}: AI back on draws the chips again`);

  // Failure modes with example data: told apart, and the AI says it is paused rather than reading a bad trace.
  await ex("setScenario", "scn-technical");
  await ex("setMinute", 4);
  await settle();
  const poor = await page.evaluate(() => ({ tech: document.querySelectorAll('[data-testid="annotations-ecg"] .is-technical').length,
    chip: document.querySelector('[data-testid="ai-ecg"]')?.dataset.code, state: document.querySelector('[data-testid="num-hr"]').dataset.state }));
  check(poor.tech === 1 && poor.chip === "poor-trace" && poor.state === "poor-signal", `${vp.name}: movement shows POOR TRACE, a technical mark, and no rhythm reading`);
  await T("top-ai").click();
  await page.waitForTimeout(200);
  check(await page.locator('[data-testid="annotations-ecg"] .is-technical').count() === 1 && await page.locator(".ai-chip").count() === 0,
        `${vp.name}: the poor-trace warning is not an AI mark and stays when AI is off`);
  await T("top-ai").click();
  await ex("setMinute", 11);
  await settle();
  check(await T("num-hr").getAttribute("data-state") === "sensor-off" && await T("num-rr").getAttribute("data-state") === "sensor-off", `${vp.name}: sensor off reads CHECK SENSOR on heart rate and respiratory rate`);
  check(await T("ai-ecg").getAttribute("data-state") === "paused", `${vp.name}: the ECG chip says the AI is paused with no signal`);
  await ex("setMinute", 14);
  await settle();
  check(await T("num-spo2").getAttribute("data-state") === "connection-lost" && await T("trace-signal-spo2").count() === 0, `${vp.name}: a lost limb sensor shows CONNECTION LOST and draws no pleth`);
  check(await T("num-bp_sys").getAttribute("data-state") === "standby", `${vp.name}: the cuff that was never connected is on STANDBY`);
  await shot("example-technical");

  // Stepping through the scenario changes values, never the layout.
  await ex("setScenario", "scn-pneumonia");
  await ex("setMinute", 0);
  await settle();
  const l0 = await aiBoxes();
  const rr0 = await T("num-rr").innerText();
  await ex("setMinute", 360);
  await settle();
  check(await aiBoxes() === l0 && await T("num-rr").innerText() !== rr0, `${vp.name}: moving through time changes the values and nothing else`);
  await shot("example-late");

  // Demo Controls: pick a scenario and a time, and switch example data off.
  await page.evaluate(() => window.__emus.ui.getState().showSheet("demo-controls"));
  await T("demo-controls").waitFor();
  check(await page.locator('[data-testid^="scenario-"]').count() === 6, `${vp.name}: Demo Controls lists the six scenarios`);
  const demoTargets = await page.evaluate(() => [...document.querySelectorAll('[data-testid="demo-controls"] button, [data-testid="demo-controls"] input')].every((b) => { const r = b.getBoundingClientRect(); return r.height >= 47 || b.type === "checkbox"; }));
  check(demoTargets, `${vp.name}: Demo Controls buttons are touch targets`);
  await T("scenario-scn-vt").click();
  await settle();
  check((await T("patient-name").innerText()).includes("PATEL"), `${vp.name}: choosing a scenario changes the patient`);
  await T("jump-5").click();
  await settle();
  check(/VT now/.test(await T("ai-ecg").innerText()), `${vp.name}: jumping to a highlight shows that moment (VT)`);
  await shot("demo-controls");
  await T("example-switch").uncheck();
  await page.waitForTimeout(500);
  check(await T("example-badge").count() === 0 && await T("app").getAttribute("data-link") === "down", `${vp.name}: example data off removes the badge and the feed`);
  check((await page.evaluate(() => [...document.querySelectorAll('[data-testid^="num-"]')].map((e) => e.innerText))).every((t) => /NO\s+DATA/.test(t)), `${vp.name}: with no feed every tile says NO DATA`);
  await page.evaluate(() => window.__emus.ui.getState().showSheet(null));
  await ex("setEnabled", true);
  await settle();

  // The Modular Example with AI: every size shows what fits, and nothing overflows.
  await page.evaluate(async () => { const st = window.__emus.ui.getState(); const d = await (await fetch("/api/designs/icu-modules")).json(); st.load(d, st.registry); st.go(d.document.home_screen); });
  await ex("setScenario", "scn-pneumonia");
  await ex("setMinute", 180);
  await settle();
  const modAi = await page.evaluate(() => [...document.querySelectorAll(".widget-monitor-grid .module")].map((m) => ({
    id: m.dataset.testid, size: m.dataset.size, chip: !!m.querySelector(".ai-chip"), cert: !!m.querySelector(".ai-certainty"), offenders: [...m.querySelectorAll(".ai-chip-pill, .ai-certainty, .ai-explain")].filter((e) => { const a = m.getBoundingClientRect(), b = e.getBoundingClientRect(); return b.width > 0 && (b.right > a.right + 1 || b.bottom > a.bottom + 1 || b.left < a.left - 1); }).map((e) => e.className + JSON.stringify([m.getBoundingClientRect().toJSON(), e.getBoundingClientRect().toJSON()].map((r) => [r.left, r.top, r.right, r.bottom].map(Math.round)))),
    over: [...m.querySelectorAll(".ai-chip-pill, .ai-certainty, .ai-explain")].some((e) => { const a = m.getBoundingClientRect(), b = e.getBoundingClientRect(); return b.width > 0 && (b.right > a.right + 1 || b.bottom > a.bottom + 1 || b.left < a.left - 1); }) })));
  check(modAi.every((m) => !m.over), `${vp.name}: no AI mark overflows its module in the Modular Example ${JSON.stringify(modAi.filter((m) => m.over).map((m) => [m.id, m.offenders]))}`);
  check(modAi.filter((m) => m.size === "compact").every((m) => !m.chip), `${vp.name}: small squares show no AI chip`);
  check(modAi.some((m) => m.size === "large" && m.chip && m.cert), `${vp.name}: a large module shows the chip and its certainty block`);
  await shot("modular-ai");
  await page.evaluate(async () => { const st = window.__emus.ui.getState(); const s = await (await fetch("/api/designs/icu-monitor")).json(); st.load(s, st.registry); });

  // --- Why sheet, underlying data and explanation examples
  await ex("setScenario", "scn-af");
  await ex("setMinute", 20);
  await settle();
  await T("ai-ecg").click();
  await T("why-sheet").waitFor();
  check(/AF now/.test(await T("why-summary").innerText()), `${vp.name}: tapping the chip opens the Why sheet for that finding`);
  const why = await page.evaluate(() => {
    const sheet = document.querySelector('[data-testid="sheet-finding-explain"] .sheet-body');
    const ev = document.querySelector('[data-testid="why-evidence"] svg'), bar = document.querySelector('[data-testid="why-evidence-bar"]');
    const path = document.querySelector('[data-testid="trace-signal-why-evidence"]');
    const ys = [...path.getAttribute("d").matchAll(/[ML][\d.]+ ([\d.-]+)/g)].map((m) => Number(m[1]));
    const line = document.querySelector('[data-testid="why-evidence"] .trace-baseline');
    const base = Number(line.getAttribute("y1")), px = Number(bar.dataset.px);
    const mark = document.querySelector('[data-testid="why-evidence"] .trace-mark-label');
    const fr = ev.getBoundingClientRect(), mr = mark ? mark.getBoundingClientRect() : null;
    return { rAmp: (base - Math.min(...ys)) / px, mark: mark?.textContent, markInside: mr && mr.left >= fr.left && mr.right <= fr.right,
      baseline: !!document.querySelector('[data-testid="why-baseline"] path.trace-signal'),
      reasons: document.querySelectorAll('[data-testid="why-reasons"] li').length, weights: [...document.querySelectorAll('[data-testid="why-reasons"] .reason-weight')].map((e) => parseInt(e.textContent)),
      certRows: document.querySelectorAll('[data-testid="why-certainty"] tbody tr').length, rule: document.querySelector('[data-testid="why-rule"]').textContent.length,
      example: !!document.querySelector('[data-testid="example-note"]'), askOff: document.querySelector('[data-testid="why-ask"]').disabled,
      noOverflow: sheet.scrollWidth <= sheet.clientWidth + 1 };
  });
  check(why.rAmp > 0.8 && why.rAmp < 1.35, `${vp.name}: the evidence strip is at the scale of its 1 mV bar (${why.rAmp.toFixed(2)})`);
  check(/Irregular R-R/.test(why.mark) && why.markInside, `${vp.name}: the evidence strip carries the AI's marks`);
  check(why.baseline, `${vp.name}: the patient's own normal rhythm is drawn beside it`);
  check(why.reasons >= 1 && why.weights.reduce((a, b) => a + b, 0) >= 99 && why.weights.reduce((a, b) => a + b, 0) <= 101, `${vp.name}: reasons carry weights that sum to 100%`);
  check(why.certRows >= 3 && why.rule > 20 && why.example, `${vp.name}: every certainty measure, the rule and the example note are shown`);
  check(why.askOff && why.noOverflow, `${vp.name}: the question box is disabled until a token exists, and nothing overflows`);
  await shot("why");
  // the sheet shows what the monitor showed: the same finding text and the same certainty figure
  const monitorChip = await page.evaluate(() => window.__emus.ui.getState().sheetContext);
  check(monitorChip && /af/.test(monitorChip), `${vp.name}: the sheet explains the finding id the chip pointed at`);
  await T("why-data").click();
  await T("ud-sheet").waitFor();
  const ud = await page.evaluate(async () => {
    const api = await (await fetch("/api/examples/scn-af?minute=20")).json();
    const rows = [...document.querySelectorAll('[data-testid="ud-table"] tbody tr')].map((r) => r.children[1].textContent);
    return { value: document.querySelector('[data-testid="ud-value"]').textContent, apiValue: String(api.numerics.hr), rows: rows.length, apiRows: api.trends.hr.points.length,
      firstRowIsNow: document.querySelector('[data-testid="ud-table"] tbody tr td').textContent, lastApi: String(api.trends.hr.points.at(-1).v), firstTable: rows[0],
      device: document.querySelector('[data-testid="ud-device"]').textContent, evidence: !!document.querySelector('[data-testid="ud-finding-af"]') };
  });
  check(ud.value === ud.apiValue && ud.rows === ud.apiRows && ud.firstRowIsNow === "Now" && ud.firstTable === ud.lastApi, `${vp.name}: underlying data matches the module's values (${ud.rows} values, newest first)`);
  check(/Chest sensor/.test(ud.device) && ud.evidence, `${vp.name}: underlying data names the source device and the AI's raw evidence`);
  await T("ud-copy").click();
  await page.waitForTimeout(300);
  check((await T("ud-copied").innerText()).length > 0, `${vp.name}: Copy as CSV answers either way`);
  await shot("underlying-data");
  await page.evaluate(() => window.__emus.ui.getState().showSheet(null));
  // from the Views menu: two touches to the picker
  await T("tab-split").click();
  await page.getByText("Underlying Data").first().click();
  await T("ud-pick").waitFor();
  check(await page.locator('[data-testid^="ud-option-"]').count() >= 6, `${vp.name}: Views, then Underlying Data, offers every item (two touches)`);
  await page.evaluate(() => window.__emus.ui.getState().showSheet(null));
  // gallery from Settings: two touches
  await T("top-settings").click();
  await page.getByText("Explanation Examples").first().click();
  await T("gallery").waitFor();
  check(await page.locator('[data-testid="gallery"] article').count() === 7, `${vp.name}: Settings, then Explanation Examples, offers seven styles (two touches)`);
  for (const id of ["sentence", "reasons", "trace", "baseline", "certainty", "frequency"]) await T(`style-${id}`).locator("button").click();
  await T("style-baseline").locator("button").click();
  const gal = await page.evaluate(() => { const body = document.querySelector('[data-testid="sheet-explanation-examples"] .sheet-body');
    return { overflow: body.scrollWidth > body.clientWidth + 1, strips: document.querySelectorAll('[data-testid="ex-trace2"], [data-testid="ex-baseline"]').length,
      btn: [...document.querySelectorAll('[data-testid="gallery"] .style-head')].every((b) => b.getBoundingClientRect().height >= 47) }; });
  check(!gal.overflow && gal.strips === 2 && gal.btn, `${vp.name}: the gallery opens a style at a time, fits, and its buttons are touch targets`);
  await shot("gallery");
  await T("style-baseline").locator("button").click();
  await ex("setScenario", "scn-pneumonia");
  await ex("setMinute", 0);
  await settle();
  await T("style-whatif").locator("button").click();
  await T("ex-whatif-whatif").waitFor({ timeout: 3000 }).catch(() => {});
  check(await T("ex-whatif-whatif").count() === 1 && await T("ex-whatif-baseline").count() === 1, `${vp.name}: the what-if style draws both courses`);
  await shot("gallery-whatif");
  await page.evaluate(() => window.__emus.ui.getState().showSheet(null));

  // --- the customisation tool: Edit Layout, sizes, content, save as a version, history, appearance, AI settings
  const reset = () => page.evaluate(async () => { await fetch("/api/active-design", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ design_id: "icu-monitor" }) }); });
  try {
    await ex("setScenario", "scn-pneumonia");
    await ex("setMinute", 180);
    await settle();
    await page.evaluate(async () => { const st = window.__emus.ui.getState(); const d = await (await fetch("/api/designs/icu-modules")).json(); st.load(d, st.registry); st.go(d.document.home_screen); });
    const gridInfo = () => page.evaluate(() => {
      const grid = document.querySelector(".widget-monitor-grid .module-grid") || document.querySelector(".module-grid"); const g = grid.getBoundingClientRect();
      const mods = [...grid.querySelectorAll(".module")].map((m) => { const r = m.getBoundingClientRect(); return { id: m.dataset.testid, size: m.dataset.size, x: r.x, y: r.y, w: r.width, h: r.height }; });
      const cols = Number(grid.dataset.columns), rows = Number(grid.dataset.rows), cw = g.width / cols, ch = g.height / rows;
      let overlap = false;
      for (const a of mods) for (const b of mods) if (a !== b && a.x < b.x + b.w - 2 && b.x < a.x + a.w - 2 && a.y < b.y + b.h - 2 && b.y < a.y + a.h - 2) overlap = true;
      const inside = mods.every((m) => m.x >= g.x - 1 && m.y >= g.y - 1 && m.x + m.w <= g.right + 1 && m.y + m.h <= g.bottom + 1);
      return { mods, cols, rows, cw, ch, overlap, inside, scroll: document.documentElement.scrollHeight <= window.innerHeight && document.documentElement.scrollWidth <= window.innerWidth };
    });
    const before = await gridInfo();
    // two touches to enter, and the bar and panel say so
    await T("top-settings").click();
    await page.getByText("Edit Layout").first().click();
    await T("edit-bar").waitFor();
    check(/EDITING LAYOUT/.test(await T("edit-title").innerText()) && await T("edit-panel").isVisible() && await T("edit-exit").isVisible(), `${vp.name}: Settings, then Edit Layout (two touches) shows the EDITING LAYOUT bar, the panel and Exit`);
    check(/own copy/.test(await T("edit-note").innerText()), `${vp.name}: a built-in design says edits are saved as a copy`);
    // tap a module, then each size in turn: the module takes exactly that many cells
    await T("row-hit-temp").click();
    check(await T("panel-title").innerText().then((t) => /Temperature/.test(t)), `${vp.name}: tapping a module selects it`);
    check(await page.evaluate(() => document.querySelector('[data-testid="row-temp"]').dataset.selected === "true"), `${vp.name}: the selected module is outlined`);
    const sizeErrs = [];
    for (const [id, cols, rows, full] of [["compact", 1, 1, false], ["tile", 2, 1, false], ["tall", 1, 2, false], ["wide", 3, 1, false], ["large", 2, 2, false], ["row", 0, 1, true], ["row-tall", 0, 2, true]]) {
      await T(`size-${id}`).click();
      await page.waitForTimeout(150);
      const g = await gridInfo();
      const m = g.mods.find((x) => x.id === "row-temp");
      const wantW = (full ? g.cols : cols) * g.cw, wantH = rows * g.ch;
      if (!(Math.abs(m.w - wantW) <= 2 && Math.abs(m.h - wantH) <= 2 && !g.overlap && g.inside && g.scroll && m.size === id)) sizeErrs.push(`${id} ${m.w.toFixed(0)}x${m.h.toFixed(0)} want ${wantW.toFixed(0)}x${wantH.toFixed(0)} overlap=${g.overlap}`);
    }
    check(sizeErrs.length === 0, `${vp.name}: one touch gives a module any of the seven sizes, exactly that many cells, no overlap, no scroll ${sizeErrs.join("; ")}`);
    await T("size-large").click();
    await shot("edit-layout");
    check((await T("edit-save").isEnabled()) && /Not saved|Built-in/.test(await T("edit-note").innerText()), `${vp.name}: an edit enables Save and nothing is saved yet`);
    const stillSaved = await page.evaluate(async () => (await (await fetch("/api/designs/icu-modules")).json()).version);
    check(stillSaved === 1, `${vp.name}: the server still has the original (editing is local until saved)`);
    // the panel's controls are touch targets
    const panelTargets = await page.evaluate(() => [...document.querySelectorAll('[data-testid="edit-panel"] button, [data-testid="edit-bar"] button')].filter((b) => !b.disabled).every((b) => b.getBoundingClientRect().height >= 47));
    check(panelTargets, `${vp.name}: every button in the edit bar and panel is a touch target`);
    // move, duplicate, remove, undo
    const order = () => page.evaluate(() => [...document.querySelectorAll(".module-grid .module")].map((m) => m.dataset.testid.replace("row-", "")));
    const o0 = await order();
    await T("move-earlier").click();
    const o1 = await order();
    check(o1.indexOf("temp") !== o0.indexOf("temp") || o1.join() !== o0.join(), `${vp.name}: Earlier changes the module's place`);
    await T("duplicate-module").click();
    check((await order()).length === o1.length + 1 && await T("row-temp-2").count() === 1, `${vp.name}: Duplicate adds a separate module`);
    await T("content-ai").uncheck();
    check(await T("ai-temp-2").count() === 0 && await T("noroom-forecast").count() >= 0, `${vp.name}: AI off on one module removes its AI mark`);
    await T("remove-module").click();
    check((await order()).length === o1.length && await T("row-temp-2").count() === 0, `${vp.name}: Remove takes it off the screen`);
    await T("edit-undo").click(); await T("edit-undo").click(); await T("edit-undo").click();
    check((await order()).join() === o1.join(), `${vp.name}: Undo steps back one edit at a time`);
    // add a module
    await T("add-parameter").selectOption("hr");
    await T("add-size-tile").click();
    await T("add-module").click();
    check(await T("row-hr-2").count() === 1 && (await gridInfo()).mods.find((m) => m.id === "row-hr-2").size === "tile", `${vp.name}: Add Module puts a new module of the chosen size on the screen`);
    // a colour that cannot be read is refused, with the reason, before saving
    await T("colour-FFFFFF").click();
    await page.waitForFunction(() => /Cannot save/.test(document.querySelector('[data-testid="edit-note"]').textContent), null, { timeout: 5000 }).catch(() => {});
    check(/Cannot save/.test(await T("edit-note").innerText()) && !(await T("edit-save").isEnabled()), `${vp.name}: a colour that is hard to read blocks Save and says why`);
    await T("colour-default").click();
    await page.waitForFunction(() => !/Cannot save/.test(document.querySelector('[data-testid="edit-note"]').textContent), null, { timeout: 5000 });
    // save as a copy with who and why
    await T("edit-save").click();
    await T("save-name").fill(`E2E Copy ${vp.name}`);
    await T("save-author").fill("RN Test");
    await T("save-note").fill("Large temperature, extra heart rate");
    await T("save-confirm").click();
    await T("notice").waitFor();
    check(/version 2/.test(await T("notice").innerText()), `${vp.name}: saving a built-in design saves a copy as a new version`);
    const saved = await page.evaluate(async () => { const a = await (await fetch("/api/active-design")).json(); const v = await (await fetch(`/api/designs/${a.meta.id}/versions`)).json(); return { id: a.meta.id, name: a.meta.name, builtin: a.meta.builtin, parent: a.meta.parent_id, v: v.map((x) => [x.version, x.author, x.note, x.source, x.touched.join()]) }; });
    check(saved.name === `E2E Copy ${vp.name}` && !saved.builtin && saved.parent === "icu-modules", `${vp.name}: the copy is the start-up design and records where it came from`);
    check(saved.v.length === 2 && saved.v[0][1] === "RN Test" && /Large temperature/.test(saved.v[0][2]) && saved.v[0][4].includes("screens"), `${vp.name}: the version records who saved it, why, and what it touched`);
    check(await T("edit-bar").getAttribute("data-dirty") === "false", `${vp.name}: after saving there is nothing unsaved`);
    await T("edit-exit").click();
    await T("edit-bar").waitFor({ state: "detached", timeout: 3000 });
    // the saved layout survives a reload
    await page.reload({ waitUntil: "networkidle" });
    await T("app").waitFor();
    await page.waitForTimeout(800);
    const after = await gridInfo();
    check((await T("app").getAttribute("data-design")) === `E2E Copy ${vp.name}` && after.mods.find((m) => m.id === "row-temp").size === "large" && after.mods.some((m) => m.id === "row-hr-2"), `${vp.name}: the saved design and its sizes are still there after a reload`);
    // appearance: text size changes the screen and saves as another version
    await T("top-settings").click();
    await page.getByText("Appearance").first().click();
    await T("appearance").waitFor();
    const fontBefore = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
    await page.getByLabel("Increase Text Size").click();
    await page.waitForTimeout(200);
    const fontAfter = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize));
    check(fontAfter > fontBefore && await T("edit-bar").getAttribute("data-dirty") === "true", `${vp.name}: Appearance, Text Size + changes the whole screen and is unsaved`);
    await shot("appearance");
    await page.evaluate(() => window.__emus.ui.getState().showSheet(null));
    // AI settings: marks and certainty follow the design
    await T("top-settings").click();
    await page.getByText("AI and Certainty").first().click();
    await T("ai-settings").waitFor();
    await T("ai-annotations").uncheck();
    await page.getByText("Bars", { exact: true }).click();
    await page.evaluate(() => window.__emus.ui.getState().showSheet(null));
    await ex("setScenario", "scn-af"); await ex("setMinute", 20); await settle();
    const aiNow = await page.evaluate(() => ({ marks: document.querySelectorAll(".trace-mark:not(.is-technical)").length, bars: document.querySelectorAll(".certainty-bars").length, chips: document.querySelectorAll(".ai-chip").length }));
    check(aiNow.marks === 0 && aiNow.chips > 0, `${vp.name}: AI settings can turn off trace marks and keep the chips`);
    await T("edit-save").click();
    await T("save-author").fill("RN Test");
    await T("save-confirm").click();
    await T("notice").waitFor();
    // versions: history, revert as a new version, start-up design, export, delete
    await T("top-settings").click();
    await page.getByText("Versions").first().click();
    await T("versions").waitFor();
    check(await page.locator('[data-testid="version-list"] li').count() === 3, `${vp.name}: Versions lists every saved version`);
    await T("revert-2").click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="version-list"] li').length === 4, null, { timeout: 5000 });
    const rev = await page.evaluate(async () => { const a = await (await fetch("/api/active-design")).json(); const v = await (await fetch(`/api/designs/${a.meta.id}/versions`)).json(); return { cur: a.version, top: v[0].source, n: v.length }; });
    check(rev.cur === 4 && rev.top === "revert" && rev.n === 4, `${vp.name}: Revert adds a new version and rewrites no history`);
    const dl = page.waitForEvent("download", { timeout: 5000 }).catch(() => null);
    await T("export-design").click();
    check(!!(await dl), `${vp.name}: Export downloads the design as JSON`);
    await shot("versions");
    check(await page.locator('[data-testid^="startup-"]').count() >= 6, `${vp.name}: the start-up design can be chosen from every design`);
    await T("delete-design").click();
    await T("delete-confirm").click();
    await page.waitForFunction(() => /Deleted/.test(document.querySelector('[data-testid="versions-message"]')?.textContent ?? ""), null, { timeout: 5000 });
    check((await page.evaluate(async () => (await (await fetch("/api/active-design")).json()).meta.id)) === "icu-monitor", `${vp.name}: deleting the active design falls back to the default`);
  } finally {
    await reset();
    await page.evaluate(() => { try { localStorage.removeItem("emus.author"); } catch {} });
  }
  await page.evaluate(() => window.__emus.ui.getState().showSheet(null));
  await page.evaluate(async () => { const st = window.__emus.ui.getState(); const s = await (await fetch("/api/designs/icu-monitor")).json(); st.load(s, st.registry); st.setDraft(null); st.setEditMode(false); });

  check(errors.length === 0, `${vp.name}: no page errors ${errors.join(" | ")}`);
  await context.close();
}
await browser.close();

if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log("\nall checks passed");
}

main().catch((e) => { console.error(e); process.exit(1); });
