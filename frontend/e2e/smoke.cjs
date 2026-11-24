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

  // --- Next Obs Due is gone; the monitor is five full-width rows and a line of four small boxes
  check(await page.getByText(/next obs/i).count() === 0, `${vp.name}: "Next Obs Due" is gone`);
  check(await page.locator(".module.row").count() === 5 && await page.locator(".module").count() === 9, `${vp.name}: the monitor is five full-width rows and a line of four small boxes`);

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
  const tiles = () => page.locator(".module.row .tile:not(.tile-empty)").evaluateAll((els) => els.map((e) => {
    const r = e.getBoundingClientRect();
    return [e.dataset.testid, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(":");
  }));
  // Tiles on the full rows share a width; a row's height is its own (the Height setting), so heights differ.
  const sizes = new Set((await tiles()).map((t) => t.split(":")[3]));
  check(sizes.size === 1, `${vp.name}: every row's tile is the same width (${[...sizes].join(", ")} px)`);
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
      bodyLevel: spread(all(".tile:not(.tile-empty)").map((t) => rect(t.querySelector(".tile-body")).top - rect(t).top)),
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
      tabLabels: spread(all(".tabbar .tab .tab-label").map((e) => rect(e).top)),
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
  check(align.tabIcons <= 0.5 && align.tabLabels <= 0.5, `${vp.name}: tab icons share a level and tab labels start on one line (${align.tabIcons}, ${align.tabLabels})`);
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
  check(await T("notif-mark").getAttribute("aria-label") === "High priority" && await T("notif-mark").locator("svg path").count() === 1 && (await T("notif-mark").textContent()) === "", `${vp.name}: it carries its priority mark, a red triangle with an exclamation mark`);
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
      sizes: new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().width))).size,
      smallest: Math.min(...tiles.map((t) => parseFloat(getComputedStyle(t.querySelector(".tile-state, .tile-value")).fontSize))),
      clipped: tiles.filter((t) => { const a = t.querySelector(".tile-state, .tile-value").getBoundingClientRect(), b = t.getBoundingClientRect();
        return a.top < b.top - 1 || a.bottom > b.bottom + 1 || a.left < b.left - 1 || a.right > b.right + 1; }).length,
      // a short tile puts the name beside its value, on one line
      head: Math.max(...tiles.filter((t) => t.querySelector(".tile-value")).map((t) =>
        Math.abs(mid(t.querySelector(".tile-name").getBoundingClientRect()) - mid(t.querySelector(".tile-value").getBoundingClientRect())))),
    };
  });
  check(shortTiles.sizes === 1 && shortTiles.smallest >= 12 && shortTiles.clipped === 0 && shortTiles.head <= 12,
        `${vp.name}: short tiles on a split screen share a width, stay readable and level (${shortTiles.smallest}px)`);
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
  check(byId.ecg.flow === "row" && byId.spo2.flow === "split" && byId.temp.flow === "stack" && byId.oxygen.flow === "tile-only" && byId.falls.flow === "split",
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
  check(await T("example-badge").count() === 0 && await page.locator(".example-mark").count() === 0, `${vp.name}: no module or bar carries an Example label`);
  check(await page.locator(".badge-proto").count() === 0 && !/Sound Not Confirmed|PROTOTYPE/.test(await page.locator(".topbar").innerText()), `${vp.name}: the top bar has no "Sound Not Confirmed" or "Prototype" label`);
  check((await T("patient-name").innerText()).includes("OKAFOR"), `${vp.name}: the scripted patient is named`);
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
    return { rAmp: (base - Math.min(...ys)) / px, inside: pb.top >= fb.top - 1 && pb.bottom <= fb.bottom + 1, n: ys.length };
  });
  check(sig && sig.n > 100, `${vp.name}: the ECG is drawn from the example strip`);
  check(sig && sig.rAmp > 0.8 && sig.rAmp < 1.35, `${vp.name}: R waves are about 1 mV tall against the 1 mV bar (${sig && sig.rAmp.toFixed(2)})`);
  check(sig && sig.inside, `${vp.name}: the signal stays inside its trace frame, top and bottom`);

  // The AI overview is off until asked for; then boxes with one or two words sit over what the AI used.
  check(await page.locator('[data-testid="annotations-ecg"] .trace-box').count() === 0, `${vp.name}: with the AI overview off the trace carries no boxes`);
  check(await T("tab-overview").getAttribute("aria-pressed") === "false", `${vp.name}: the AI Overview button shows it is off`);
  await T("tab-overview").click();
  await page.waitForTimeout(300);
  const ann = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll('[data-testid="annotations-ecg"] .trace-box')];
    const clip = document.querySelector('[data-testid="trace-frame-ecg"]').getBoundingClientRect();
    const labelled = boxes.filter((b) => b.dataset.label);
    return { n: boxes.length, labels: [...new Set(labelled.map((b) => b.dataset.label))], words: labelled.every((b) => b.dataset.label.split(" ").length <= 3), inFrame: boxes.every((b) => { const r = b.querySelector("rect").getBoundingClientRect(); return r.top >= clip.top - 1 && r.bottom <= clip.bottom + 1; }) };
  });
  check(ann.n > 5 && ann.labels.includes("Irregular R-R") && ann.words && ann.inFrame, `${vp.name}: the overview boxes the irregular R-R, in one or two words (${ann.labels.join(", ")})`);
  const movedA = await page.evaluate(async () => { const g = document.querySelector('[data-testid="sweep-ecg"]'); const t = () => new DOMMatrix(getComputedStyle(g).transform).m41; const a = t(); await new Promise((r) => setTimeout(r, 600)); return { a, b: t(), travel: Number(g.dataset.travel) }; });
  check(movedA.travel > 100 && movedA.b < movedA.a - 5, `${vp.name}: the trace sweeps across (moved ${(movedA.a - movedA.b).toFixed(0)} px in 0.6 s)`);
  await shot("overview-on");
  await T("tab-overview").click();

  // The AI chip: finding, certainty (named), and a touch target that opens Why.
  const chip = T("ai-ecg");
  check(/AF - \d+% Certainty/.test(await chip.innerText()) && !/Why\?/.test(await chip.innerText()), `${vp.name}: the ECG chip reads "AF - X% Certainty" with no Why link`);
  const chipBox = await chip.boundingBox();
  check(chipBox.height >= MIN_TOUCH - 1 && chipBox.width >= MIN_TOUCH - 1, `${vp.name}: the AI chip is a touch target`);
  const chipInside = await page.evaluate(() => [...document.querySelectorAll('.module .ai-chip-pill')].every((p) => {
    const m = p.closest(".module, .row").getBoundingClientRect(), b = p.getBoundingClientRect();
    return b.left >= m.left - 1 && b.right <= m.right + 1 && b.top >= m.top - 1 && b.bottom <= m.bottom + 1; }));
  check(chipInside, `${vp.name}: every AI chip sits inside its module`);
  const smallest = await page.evaluate(() => Math.min(...[...document.querySelectorAll(".ai-chip-pill, .trace-box-label")].map((e) => parseFloat(getComputedStyle(e).fontSize))));
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
    marks: document.querySelectorAll(".trace-mark:not(.is-technical), .trace-box").length, pressed: document.querySelector('[data-testid="top-ai"]').getAttribute("aria-pressed") }));
  check(off.chips === 0 && off.certainty === 0 && off.marks === 0 && off.pressed === "false", `${vp.name}: AI Off draws no chips, certainty or trace marks`);
  check(await aiBoxes() === beforeAi, `${vp.name}: switching AI off moved and resized nothing`);
  check((await T("num-hr").innerText()).includes("144") && await T("trace-signal-ecg").count() === 1, `${vp.name}: numbers and traces stay when AI is off`);
  await shot("example-ai-off");
  await page.reload({ waitUntil: "networkidle" });
  await T("tab-overview").waitFor();
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
  check(/VT - \d+% Certainty/.test(await T("ai-ecg").innerText()), `${vp.name}: jumping to a highlight shows that moment (VT)`);
  await shot("demo-controls");
  await T("example-switch").uncheck();
  await page.waitForTimeout(500);
  check(await T("app").getAttribute("data-link") === "down", `${vp.name}: example data off removes the feed`);
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
    const mark = document.querySelector('[data-testid="why-evidence"] .trace-box-label');
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
    const aiNow = await page.evaluate(() => ({ marks: document.querySelectorAll(".trace-mark:not(.is-technical), .trace-box").length, bars: document.querySelectorAll(".certainty-bars").length, chips: document.querySelectorAll(".ai-chip").length }));
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


  // --- this round: SpO2 axis, position and falls figures, BP as dots and tails, the ABCDE screen, the NEWS2 chart, big numbers
  const goDesign = (d, sc) => page.evaluate(async ([d, sc]) => { const st = window.__emus.ui; const r = await (await fetch(`/api/designs/${d}`)).json(); st.getState().load(r, st.getState().registry); st.setState({ screenId: sc ?? r.document.home_screen, openSheet: null, openMenu: null }); }, [d, sc]);
  const api = (path) => page.evaluate(async (p) => (await fetch(p)).json(), path);
  await goDesign("icu-monitor");
  await ex("setScenario", "scn-pneumonia"); await ex("setMinute", 0); await settle();
  const spo2 = await page.evaluate(() => {
    const ax = document.querySelector('[data-testid="overlay-axis-spo2"]'); const f = document.querySelector('[data-testid="trace-frame-spo2"]').getBoundingClientRect();
    const t = (v) => document.querySelector(`[data-testid="overlay-tick-${v}"]`)?.getBoundingClientRect();
    const trend = document.querySelector('[data-testid="overlay-trend-spo2"]')?.getBoundingClientRect();
    return { range: ax?.dataset.range, t100: t(100) && Math.round(t(100).top), t50: t(50) && Math.round(t(50).top), inside: !t(100) || (t(100).right <= f.right + 1 && t(50).bottom <= f.bottom + 1), trend: !!trend };
  });
  check(spo2.range === "50,100" && spo2.t100 != null && spo2.t50 != null && spo2.t100 < spo2.t50 && spo2.inside && spo2.trend, `${vp.name}: the SpO2 row has a 50 to 100 % axis on its right and the SpO2 trend drawn on it`);
  // BP as dots with tails and a dashed line, against the API's readings
  const bp = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="bp-dot-bp-"]')].map((g) => ({ x: +g.dataset.x, y: +g.dataset.y, top: +g.dataset.top, bottom: +g.dataset.bottom })));
  const apiBp = (await api("/api/examples/scn-pneumonia?minute=0")).bp_readings;
  check(bp.length >= 3 && bp.length <= apiBp.length && bp.every((d) => d.top < d.y && d.y < d.bottom) && bp.every((d, i) => i === 0 || d.x > bp[i - 1].x), `${vp.name}: BP has a systolic, MAP and diastolic marker at each reading, oldest to newest (${bp.length} readings)`);
  const bpLine = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="bp-line-bp"]')).strokeDasharray);
  check(bpLine && bpLine !== "none", `${vp.name}: the BP dots are joined by a dashed line`);
  const tempKey = await page.evaluate(() => { const k = document.querySelector('[data-testid="temp-key-temp"]'); const f = document.querySelector('[data-testid="trace-frame-temp"]').getBoundingClientRect(); if (!k) return null; const r = k.getBoundingClientRect();
    const hit = [...document.querySelectorAll('[data-testid^="temp-dot-temp"], [data-testid="trace-signal-temp"]')].some((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && !(b.right < r.left - 2 || b.left > r.right + 2 || b.bottom < r.top - 2 || b.top > r.bottom + 2) && e.tagName === "circle"; });
    return { inside: r.left >= f.left && r.right <= f.right && r.top >= f.top - 1 && r.bottom <= f.bottom + 1, hit, text: k.textContent }; });
  check(tempKey && tempKey.inside && !tempKey.hit && /Skin Sensor/.test(tempKey.text) && /Thermometer/.test(tempKey.text), `${vp.name}: thermometer and skin temperature share a plot with a small key that covers no point`);
  // Position and falls: a human outline, in words, in Title Case
  await ex("setScenario", "scn-copd"); await ex("setMinute", -20); await settle();
  const pos = await page.evaluate(() => ({ pose: document.querySelector('[data-testid="position-figure"]')?.dataset.pose, word: document.querySelector(".position-word")?.textContent, meaning: document.querySelector(".position-meaning")?.textContent,
    name: [...document.querySelectorAll(".tile-name")].map((e) => e.textContent.trim()).filter((t) => /Position/.test(t))[0], fallen: document.querySelector('[data-testid="fall-figure"]')?.dataset.fallen,
    figs: [...document.querySelectorAll(".position-figure")].every((f) => { const r = f.getBoundingClientRect(), t = f.closest(".tile").getBoundingClientRect(); return r.width > 20 && r.left >= t.left && r.right <= t.right && r.top >= t.top && r.bottom <= t.bottom; }) }));
  check(pos.pose === "walking" && pos.word === "Walking" && pos.meaning === "Up And Moving" && /^Position/.test(pos.name || ""), `${vp.name}: the Position tile draws a walking outline and says Walking, Up And Moving (${pos.name})`);
  check(pos.fallen === "true" && pos.figs, `${vp.name}: the Falls tile draws a fall and every figure fits its tile`);
  await ex("setScenario", "scn-vt"); await ex("setMinute", 5); await settle();
  const sup = await page.evaluate(() => ({ pose: document.querySelector('[data-testid="position-figure"]')?.dataset.pose, word: document.querySelector(".position-word")?.textContent, meaning: document.querySelector(".position-meaning")?.textContent, fallen: document.querySelector('[data-testid="fall-figure"]')?.dataset.fallen }));
  check(sup.pose === "supine" && sup.word === "Supine" && sup.meaning === "Lying On Back" && sup.fallen === "false", `${vp.name}: Supine is drawn lying on the back and explained, and no fall says so`);

  // Big numbers on the left of a card, the detail on the right
  await goDesign("icu-modules");
  await ex("setScenario", "scn-pneumonia"); await ex("setMinute", 180); await settle();
  const cards = await page.evaluate(() => [...document.querySelectorAll(".module-grid .module")].filter((m) => m.dataset.flow !== "row").map((m) => {
    const r = m.getBoundingClientRect(), t = m.querySelector(".tile-primary .tile-value, .tile-position")?.getBoundingClientRect(), d = m.querySelector(".module-detail")?.getBoundingClientRect();
    const fs = m.querySelector(".tile-primary .tile-value") ? parseFloat(getComputedStyle(m.querySelector(".tile-primary .tile-value")).fontSize) : null;
    return { id: m.dataset.testid, flow: m.dataset.flow, size: m.dataset.size, fs, leftHalf: !t || m.dataset.flow !== "split" || t.right <= r.left + r.width / 2 + 1, detailRight: !d || m.dataset.flow !== "split" || d.left >= r.left + r.width / 2 - 2, parameter: m.dataset.parameter };
  }));
  const bigEnough = cards.filter((c) => c.fs != null && !["activity", "falls", "bp_sys", "spo2"].includes(c.parameter)).every((c) => c.fs >= (c.size === "compact" ? 28 : 32));
  check(bigEnough, `${vp.name}: numbers on cards are big (${cards.filter((c) => c.fs).map((c) => `${c.id.replace("row-", "")} ${Math.round(c.fs)}`).join(", ")})`);
  check(cards.every((c) => c.leftHalf && c.detailRight), `${vp.name}: on a split card the number is in the left half and the detail in the right`);
  const list = await page.evaluate(() => [...document.querySelectorAll('[data-testid="row-bp"] [data-testid^="bp-reading-"]')].map((r) => r.textContent));
  const api180 = (await api("/api/examples/scn-pneumonia?minute=180")).bp_readings;
  check(list.length >= 3 && list.every((t, i) => t.includes(`${api180[i].sys}/${api180[i].dia}`) && t.includes(`(${api180[i].map})`) && /\d{2}:\d{2}/.test(t) && /\d{2}\/\d{2}/.test(t)), `${vp.name}: the BP card lists the latest readings with time, date, sys/dia and MAP in brackets (${list.length} shown)`);

  // ABCDE: one touch, five checks, bloods with their recency, trends, and the NEWS2 chart beside it
  await goDesign("icu-monitor", "monitor");
  await ex("setScenario", "scn-pneumonia"); await ex("setMinute", 0); await settle();
  await T("tab-abcde").click();
  await T("abcde").waitFor();
  check(await T("screen-abcde").isVisible() && await T("news2-chart").isVisible(), `${vp.name}: the ABCDE tab is one touch and shows the NEWS2 chart on its other half`);
  const halves = await page.evaluate(() => { const a = document.querySelector('[data-testid="abcde"]').getBoundingClientRect(), n = document.querySelector('[data-testid="news2-chart"]').getBoundingClientRect(), s = document.querySelector(".screen").getBoundingClientRect(); return { a: a.width / s.width, n: n.width / s.width }; });
  check(halves.a > 0.4 && halves.a < 0.6 && halves.n > 0.4 && halves.n < 0.6, `${vp.name}: ABCDE takes half the screen and the chart the other half`);
  check((await page.locator('.abcde-sec[data-letter]').evaluateAll((e) => e.map((x) => x.dataset.letter).join(""))) === "ABCDE", `${vp.name}: A, B, C, D and E are each checked`);
  const stat = await page.evaluate(() => Object.fromEntries([..."ABCDE"].map((l) => [l, document.querySelector(`.abcde-sec[data-letter="${l}"] .abcde-status`).textContent.replace(/[!✓]/g, "").trim()])));
  check(Object.values(stat).every((v) => ["OK", "Check", "Urgent", "Not Assessed"].includes(v)) && stat.A === "Not Assessed", `${vp.name}: each letter has a status word (${JSON.stringify(stat)})`);
  const obs = (await api("/api/examples/scn-pneumonia?minute=0")).obs_sets;
  const chart = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="news-total-"]')].map((e) => +e.dataset.total));
  check(chart.length >= 3 && chart.join() === obs.slice(-chart.length).map((o) => o.news2_total).join(), `${vp.name}: the NEWS2 chart's totals are the API's (${chart.join(", ")})`);
  const rec = await page.evaluate(() => Object.fromEntries(["gas", "bloods", "glucose"].map((k) => [k, document.querySelector(`[data-testid="blood-${k}-recency"]`)?.textContent])));
  check(rec.gas === "Current" && rec.bloods === "Current" && rec.glucose === "Current", `${vp.name}: results taken within the hour read Current (${JSON.stringify(rec)})`);
  check(/\d{2}\/\d{2} \d{2}:\d{2}/.test(await T("blood-gas-when").innerText()), `${vp.name}: each set shows the date and time it was taken`);
  await ex("setScenario", "scn-copd"); await ex("setMinute", -20); await settle();
  check(await T("blood-gas-recency").innerText() === "Within 24 Hours", `${vp.name}: a gas from 14 hours ago reads Within 24 Hours`);
  await ex("setScenario", "scn-technical"); await ex("setMinute", 0); await settle();
  check(await T("blood-glucose-recency").innerText() === "No Recent Bloods" && await T("blood-glucose-glucose").count() === 0 && await T("blood-glucose-show").isVisible(), `${vp.name}: bloods 50 hours old read No Recent Bloods with a button to show them`);
  await T("blood-glucose-show").click();
  check(await T("blood-glucose-glucose").isVisible() && /\d{2}\/\d{2}/.test(await T("blood-glucose-when").innerText()), `${vp.name}: tapping shows the most recent from the last 72 hours with its date`);
  await ex("setScenario", "scn-pneumonia"); await ex("setMinute", 0); await settle();
  await T("d-gcs-btn").click();
  await T("assess-gcs").waitFor();
  await page.getByText("3 Words").click();
  check(/GCS 13/.test(await T("gcs-total").innerText()), `${vp.name}: the GCS calculator adds as it is chosen`);
  await T("gcs-save").click();
  check(/^13 \(E4 V3 M6\)/.test(await T("d-gcs").innerText()), `${vp.name}: the GCS is recorded with its time on the screen`);
  await T("d-avpu-btn").click();
  await T("avpu-V").click();
  check(/V/.test(await T("d-avpu").innerText()), `${vp.name}: AVPU is two touches from the tab and one tap to record`);
  await T("abcde-trends").click();
  await T("trends-sheet").waitFor();
  check(await page.locator('figure[data-testid^="trend-"]').count() === 5, `${vp.name}: the Trends button shows heart rate, respiration, SpO2, BP and temperature`);
  const trendsOk = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="trend-"] svg')].every((s) => { const r = s.getBoundingClientRect(), p = s.parentElement.getBoundingClientRect(); return r.width <= p.width + 1; }));
  check(trendsOk, `${vp.name}: every trend chart fits its box`);
  await shot("trends");
  await page.evaluate(() => window.__emus.ui.getState().showSheet(null));
  await shot("abcde");
  const halfChart = await page.evaluate(() => { const c = document.querySelector('[data-testid="news2-chart"]'), r = c.getBoundingClientRect(), last = document.querySelector('[data-testid="news-risks"]').getBoundingClientRect(); return last.bottom <= r.bottom - 1 && c.scrollHeight <= c.clientHeight + 1; });
  check(halfChart, `${vp.name}: the ABCDE half shows the NEWS2 chart to its bottom row without scrolling`);
  await T("tab-news2").click();
  check(await T("news2-chart").isVisible() && await page.locator('[data-testid^="news-cell-rr-"]').count() >= 3, `${vp.name}: the NEWS2 tab is the real chart`);
  await shot("news2");
  // The chart is the printed RCP chart: every band row, a dot in the row of each value, a key, and a scale toggle
  const comps = (await api("/api/examples/scn-pneumonia?minute=0")).obs_sets;
  const cells = await page.evaluate(() => ["rr", "hr", "temp"].map((k) => [k, [...document.querySelectorAll(`[data-testid^="news-cell-${k}-"]`)].map((e) => +e.dataset.score)]));
  for (const [k, got] of cells) {
    check(got.length >= 3 && got.join() === comps.slice(-got.length).map((o) => o.news2_components[k]).join(), `${vp.name}: each ${k} dot sits in a row that scores what the API scored (${got.join(", ")})`);
  }
  check(await page.locator('[data-testid^="news-band-bp_sys-"]').count() === 14 && await page.locator('[data-testid^="news-band-hr-"]').count() === 12, `${vp.name}: the blood pressure and pulse blocks have every printed row`);
  check(await page.locator('[data-testid="news-key"] .news2-key-box').count() === 4, `${vp.name}: the NEWS key shows 0, 1, 2 and 3`);
  const tails = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="news-tail-"]')].map((e) => +e.dataset.diaY - +e.dataset.sysY));
  check(tails.length >= 3 && tails.every((d) => d >= 0), `${vp.name}: each blood pressure on the chart has a tail from the systolic dot down to the diastolic number`);
  // continuous axes: an X at each MAP between the diastolic and systolic, half as many ticks, dots inside the band of their score
  const maps = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="news-map-"]')].map((e) => { const t = e.parentElement; return { v: +e.dataset.value, y: +e.dataset.y, sys: +t.dataset.sysY, dia: +t.dataset.diaY }; }));
  check(maps.length >= 3 && maps.every((m) => m.y >= m.sys && m.y <= m.dia), `${vp.name}: an X marks each MAP between its systolic and diastolic`);
  check(maps.map((m) => m.v).join() === comps.slice(-maps.length).map((o) => o.values.bp_mean).join(), `${vp.name}: the X marks are the API's MAPs (${maps.map((m) => m.v).join(", ")})`);
  const printed = { rr: 7, hr: 12, bp_sys: 14, temp: 6 };
  const tickCounts = await page.evaluate((keys) => Object.fromEntries(keys.map((k) => [k, document.querySelectorAll(`[data-testid^="news-tick-${k}-"]`).length])), Object.keys(printed));
  check(Object.entries(printed).every(([k, rows]) => tickCounts[k] >= 1 && tickCounts[k] <= Math.ceil(rows / 2)), `${vp.name}: the side scales have at most half as many ticks as printed rows (${JSON.stringify(tickCounts)})`);
  const inBand = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="news-cell-hr-"]')].every((c) => {
    const y = +c.dataset.y; const band = [...document.querySelectorAll('[data-testid^="news-band-hr-"]')].find((b) => +b.dataset.from - 0.6 <= y && y <= +b.dataset.to + 0.6);
    return band && +band.dataset.score === +c.dataset.score;
  }));
  check(inBand, `${vp.name}: each pulse dot sits at its true height, inside the band of its score`);
  // blood pressure: the trend follows the MAP, dashed lines link the systolic and diastolic, arrows mark them
  const bpMarks = await page.evaluate(() => ({ sys: document.querySelectorAll('[data-testid^="news-sysmark-"]').length, dia: document.querySelectorAll('[data-testid^="news-diamark-"]').length,
    solid: !!document.querySelector('[data-testid="news-line-bp_sys"]') && !document.querySelector('[data-testid="news-line-bp_sys"]').classList.contains("n2-dashed"),
    dashed: [...document.querySelectorAll('[data-testid^="news-line-bp_sys-"]')].every((e) => e.classList.contains("n2-dashed")) && document.querySelectorAll('[data-testid^="news-line-bp_sys-"]').length === 2,
    sysDown: [...document.querySelectorAll('[data-testid^="news-sysmark-"]')].every((e) => { const p = e.getAttribute("points").split(" ").map((q) => q.split(",").map(Number)); return p[2][1] > p[0][1]; }),
    diaUp: [...document.querySelectorAll('[data-testid^="news-diamark-"]')].every((e) => { const p = e.getAttribute("points").split(" ").map((q) => q.split(",").map(Number)); return p[2][1] < p[0][1]; }),
    mapLine: (document.querySelector('[data-testid="news-line-bp_sys"]')?.getAttribute("points") ?? "").split(" ").length }));
  check(bpMarks.sys >= 3 && bpMarks.sys === bpMarks.dia && bpMarks.sysDown && bpMarks.diaUp, `${vp.name}: systolic is a down-facing arrow and diastolic an up-facing arrow (${bpMarks.sys} of each)`);
  check(bpMarks.solid && bpMarks.dashed && bpMarks.mapLine === maps.length, `${vp.name}: a solid line follows the MAP and dashed lines link the systolic and diastolic trends`);
  check(await T("news2-chart").getAttribute("data-spo2-scale") === "1" && await page.locator('[data-testid^="news-band-spo2-"]').count() === 4, `${vp.name}: the chart shows SpO2 Scale 1 for this patient`);
  await T("news-toggle-scale").click();
  check(await T("news2-chart").getAttribute("data-spo2-scale") === "2" && await page.locator('[data-testid^="news-band-spo2-"]').count() === 8, `${vp.name}: Toggle SpO2 Scale shows Scale 2 and its eight rows`);
  await T("news-toggle-scale").click();
  const bandFills = await page.evaluate(() => { const f = (s) => getComputedStyle(document.querySelector(`[data-testid="${s}"] .n2-bandcont, [data-testid="${s}"] .n2-bandrow`)).fill; return [f("news-band-rr-2"), f("news-band-rr-5"), f("news-band-rr-1"), f("news-band-rr-0")]; });
  check(new Set(bandFills).size === 4, `${vp.name}: rows are coloured by score, white, yellow, orange, red (${bandFills.join(" / ")})`);
  const chartFits = await page.evaluate(() => { const c = document.querySelector('[data-testid="news2-chart"]').getBoundingClientRect(), s = document.querySelector(".news2-svg").getBoundingClientRect(); return s.right <= c.right + 1 && s.left >= c.left - 1; });
  check(chartFits, `${vp.name}: the chart fits its box across`);
  const wholeChart = await page.evaluate(() => { const c = document.querySelector('[data-testid="news2-chart"]'), r = c.getBoundingClientRect(), last = document.querySelector('[data-testid="news-risks"]').getBoundingClientRect(); return { bottomIn: last.bottom <= r.bottom - 1, noScroll: c.scrollHeight <= c.clientHeight + 1 }; });
  check(wholeChart.bottomIn && wholeChart.noScroll, `${vp.name}: the whole chart, down to the clinical risk row, is on screen without scrolling`);

  // Blood pressure numbers sit above and below the tails; every trace has its x scale, even on a small module
  await goDesign("icu-monitor", "monitor"); await ex("setScenario", "scn-pneumonia"); await ex("setMinute", 180); await settle();
  const bpNums = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="bp-num-bp-"]')].map((g) => {
    const i = g.dataset.testid.split("-").pop(), d = document.querySelector(`[data-testid="bp-dot-bp-${i}"]`);
    return { above: +g.dataset.sysY < +d.dataset.top, below: g.dataset.diaY === undefined || +g.dataset.diaY > +d.dataset.bottom, sys: document.querySelector(`[data-testid="bp-sys-bp-${i}"]`).textContent };
  }));
  check(bpNums.length >= 3 && bpNums.every((n) => n.above && n.below), `${vp.name}: each cuff pressure has its systolic above the tail and its diastolic below it (${bpNums.length} labelled)`);
  const bpApi = (await api("/api/examples/scn-pneumonia?minute=180")).bp_readings;
  check(bpNums.some((n) => n.sys.startsWith(String(bpApi[0].sys))), `${vp.name}: the newest labelled systolic is the API's ${bpApi[0].sys}`);
  await goDesign("icu-modules", "monitor"); await settle();
  for (const id of ["bp", "temp", "resp"]) {
    check(await T(`xscale-${id}`).count() === 1 && await T(`xscale-${id}`).isVisible(), `${vp.name}: the ${id} module has its x scale as a number`);
  }
  await T("xscale-bp").click();
  await T("xscale-option-bp-720").click();
  check((await T("xscale-bp").innerText()).trim() === "12 h", `${vp.name}: choosing a window on a small module changes its number`);
  const bounds = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="trace-frame-"]')].filter((f) => f.getBoundingClientRect().width > 0).every((f) => {
    const r = f.getBoundingClientRect();
    return [...f.querySelectorAll("path.trace-signal, path.discrete-line, path.overlay-trend, circle")].filter((e) => !e.closest(".sweep")).every((e) => { const b = e.getBoundingClientRect(); return b.width === 0 || (b.left >= r.left - 1 && b.right <= r.right + 1 && b.top >= r.top - 1 && b.bottom <= r.bottom + 1); });
  }));
  check(bounds, `${vp.name}: every line and dot stays inside its graph (a sweeping strip is clipped to its plot)`);
  await page.evaluate(() => window.__emus.ui.getState().setXScale("bp", null));

  // ---- Round 7: the monitor line, richer boxes, heights, Measure buttons
  await goDesign("icu-monitor", "monitor"); await ex("setScenario", "scn-pneumonia"); await ex("setMinute", 360); await settle();
  const line = await page.evaluate(() => { const g = document.querySelector('[data-testid="grid-monitor-rows"]'); const R = (id) => document.querySelector(`[data-testid="row-${id}"]`).getBoundingClientRect(); const o = R("oxygen"), a = R("activity"), f = R("falls"), n = R("news"), t = R("temp"); return { cols: g.dataset.columns, sameLine: [a, f, n].every((r) => Math.abs(r.top - o.top) < 2), order: o.left < a.left && a.left < f.left && f.left < n.left, below: o.top >= t.bottom - 1, narrow: a.width < t.width / 3 && f.width < t.width / 3, newsWider: n.width > a.width }; });
  check(line.cols === "9" && line.sameLine && line.order && line.below && line.narrow && line.newsWider, `${vp.name}: O2 flow, activity, falls and NEWS sit on one line under the traces as small boxes (${JSON.stringify(line)})`);
  const heights = await page.evaluate(() => Object.fromEntries(["ecg", "spo2", "resp", "bp", "temp"].map((id) => [id, document.querySelector(`[data-testid="row-${id}"]`).getBoundingClientRect().height])));
  check(heights.ecg > heights.resp * 1.15 && heights.spo2 > heights.resp * 1.15 && heights.bp > heights.ecg, `${vp.name}: ECG and SpO2 are taller than respiration and BP taller still (${Object.values(heights).map(Math.round).join(", ")})`);
  const api360 = await api("/api/examples/scn-pneumonia?minute=360");
  const noteOf = (id) => page.locator(`[data-testid="note-${id}-0"]`).innerText();
  check(/Sinus/.test(await noteOf("hr")) && await noteOf("rr") === "Irregular" && /24 H Max 38\.\d Min 3\d\.\d/.test(await noteOf("temp")), `${vp.name}: the ECG box says the rhythm, the RR box says Irregular and the temp box shows the 24 H max and min`);
  const t24 = api360.extremes_24h.temp;
  check((await noteOf("temp")).includes(`Max ${t24.max.toFixed(1)}`) && (await noteOf("temp")).includes(`Min ${t24.min.toFixed(1)}`), `${vp.name}: those extremes are the API's (${t24.max}, ${t24.min})`);
  await ex("setScenario", "scn-af"); await ex("setMinute", 100); await settle();
  check(/Atrial/.test(await noteOf("hr")), `${vp.name}: AF reads as Atrial Fibrillation in the ECG box`);
  await ex("setScenario", "scn-stable"); await ex("setMinute", 0); await settle();
  check(await noteOf("rr") === "Regular", `${vp.name}: steady breathing reads Regular`);
  await ex("setScenario", "scn-copd"); await ex("setMinute", 0); await settle();
  const copd = await api("/api/examples/scn-copd?minute=0");
  check(await T("falls-24h").getAttribute("data-count") === String(copd.falls_24h) && copd.falls_24h >= 1 && /Fall/.test(await T("falls-24h").innerText()), `${vp.name}: the falls box shows the falls in the last 24 hours (${copd.falls_24h})`);
  const acts = await page.evaluate(() => Object.fromEntries(["standing", "walking", "movement"].map((k) => [k, +document.querySelector(`[data-testid="activity-${k}"]`).dataset.minutes])));
  check(acts.standing === copd.activity_24h.standing_min && acts.walking === copd.activity_24h.walking_min && acts.movement === copd.activity_24h.movement_min && acts.standing > 0, `${vp.name}: the activity box shows standing, walking and movement time (${JSON.stringify(acts)})`);
  const strip = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="news-strip-"][data-total]')].map((e) => +e.dataset.total));
  check(strip.length >= 2 && strip[strip.length - 1] === copd.news2.total, `${vp.name}: the NEWS box shows totals by date and time, ending with now (${strip.join(", ")})`);
  const bpFont = await page.evaluate(() => { const t = document.querySelector('[data-testid="num-bp_sys"]'); const m = t.querySelector(".tile-main"); const ex2 = t.querySelector(".tile-extra:not(.tile-extra-wrap)"); return [parseFloat(getComputedStyle(m).fontSize), parseFloat(getComputedStyle(ex2).fontSize)]; });
  check(bpFont[0] === bpFont[1], `${vp.name}: the diastolic is the same size as the systolic (${bpFont.join(" and ")} px)`);
  check((await page.locator('[data-testid="bp-key"]').textContent()).replace(/\s+/g, " ").includes("SystolicDiastolicMAP"), `${vp.name}: the BP trace has a key for the arrows and the X`);
  const bpTicks = await page.evaluate(() => [...document.querySelectorAll('[data-testid="trace-frame-bp"] text.trace-label')].filter((t) => /^\d+$/.test(t.textContent)).length);
  check(bpTicks >= 4, `${vp.name}: the BP scale has at least four values (${bpTicks})`);
  const bpShapes = await page.evaluate(() => ({ sys: document.querySelectorAll('[data-testid^="bp-sysmark-bp-"]').length, dia: document.querySelectorAll('[data-testid^="bp-diamark-bp-"]').length, map: document.querySelectorAll('[data-testid^="bp-mapmark-bp-"]').length, lines: ["bp-line-bp", "bp-line-sys-bp", "bp-line-dia-bp"].every((i) => document.querySelector(`[data-testid="${i}"]`)) }));
  check(bpShapes.sys >= 3 && bpShapes.sys === bpShapes.dia && bpShapes.sys === bpShapes.map && bpShapes.lines, `${vp.name}: the main BP trace has arrows, X marks for the MAP and dashed lines joining each (${JSON.stringify(bpShapes)})`);
  check((await page.locator('[data-testid="temp-key-temp"]').textContent()).includes("Thermometer") && !(await page.locator('[data-testid="temp-key-temp"]').textContent()).includes("Measured"), `${vp.name}: the temperature key says Thermometer`);
  // heights in Edit Layout
  await T("top-settings").click(); await page.getByText("Edit Layout").first().click();
  await T("row-hit-ecg").click();
  const hBefore = await page.evaluate(() => document.querySelector('[data-testid="row-ecg"]').getBoundingClientRect().height);
  await T("height-2").click();
  const hAfter = await page.evaluate(() => document.querySelector('[data-testid="row-ecg"]').getBoundingClientRect().height);
  check(hAfter > hBefore * 1.25, `${vp.name}: choosing Double height in Edit Layout makes the ECG taller at once (${Math.round(hBefore)} to ${Math.round(hAfter)} px)`);
  await T("height-0.75").click();
  const shorter = await page.evaluate(() => document.querySelector('[data-testid="row-ecg"]').getBoundingClientRect().height);
  check(shorter < hBefore, `${vp.name}: Shorter makes it shorter than standard (${Math.round(shorter)} px)`);
  await page.evaluate(() => { window.__emus.ui.getState().showSheet(null); });
  await T("edit-exit").click().catch(() => {});
  await goDesign("icu-monitor", "monitor"); await settle();
  // Measure buttons are in the tab bar, one touch, and add a simulated reading
  await ex("setScenario", "scn-pneumonia"); await ex("setMinute", 360); await settle();
  check(await T("tab-measure-bp").isVisible() && await T("tab-measure-temp").isVisible(), `${vp.name}: Measure BP and Measure Temp are in the tab bar`);
  const tabBox = await page.evaluate(() => [...document.querySelectorAll(".tabbar .tab")].map((e) => { const r = e.getBoundingClientRect(); return r.right <= innerWidth + 1 && r.height >= 48; }).every(Boolean));
  check(tabBox, `${vp.name}: all twelve tabs fit across the screen and are touch targets`);
  const bpBefore = (await page.locator('[data-testid^="bp-dot-bp-"]').count());
  const sheetOpen = () => page.evaluate(() => window.__emus.ui.getState().openSheet ?? null);
  await T("tab-measure-bp").click();
  check(await T("tab-measure-bp").getAttribute("data-measuring") === "true" && await sheetOpen() === null && await page.locator(".sheet, [role=dialog]").count() === 0, `${vp.name}: one touch on Measure BP starts it and nothing opens`);
  const pulse = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="tab-measure-bp"]')).animationName);
  check(pulse === "measure-pulse" || matchMedia("(prefers-reduced-motion: reduce)").matches, `${vp.name}: the Measure BP tab button pulses while it measures (${pulse})`);
  check(await T("row-bp").getAttribute("data-measuring") === null && !/measure-pulse/.test(await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="row-bp"]')).animationName)), `${vp.name}: the BP box on the observations does not pulse`);
  await T("tab-measure-bp").click();
  check(await T("tab-measure-bp").getAttribute("data-measuring") === null, `${vp.name}: touching it again cancels the measurement before it finishes`);
  await page.waitForTimeout(500);
  check((await page.locator('[data-testid^="bp-dot-bp-"]').count()) === bpBefore, `${vp.name}: a cancelled measurement adds no reading`);
  await T("tab-measure-bp").click();
  await page.waitForFunction(() => !document.querySelector('[data-testid="tab-measure-bp"]').dataset.measuring, null, { timeout: 14000 });
  const mm = await api("/api/examples/scn-pneumonia/measure?kind=bp&minute=360");
  await settle();
  check((await page.locator('[data-testid^="bp-dot-bp-"]').count()) === bpBefore + 1, `${vp.name}: when it finishes the pulse stops and the new BP is on the trace`);
  check((await T("num-bp_sys").innerText()).includes(`${mm.bp.sys}`), `${vp.name}: and in the BP tile`);
  await T("tab-measure-temp").click();
  check(await T("tab-measure-temp").getAttribute("data-measuring") === "true" && await T("tab-measure-bp").getAttribute("data-measuring") === null, `${vp.name}: Measure Temp pulses its own tab button, not the BP one`);
  await page.waitForFunction(() => !document.querySelector('[data-testid="tab-measure-temp"]').dataset.measuring, null, { timeout: 10000 });
  await settle();
  check(await page.locator('[data-testid^="temp-dot-temp-"]').count() >= 1, `${vp.name}: Measure Temp adds a thermometer point`);
  await T("tab-measure-bp").click();
  await ex("setMinute", 361); await settle();
  check(await T("tab-measure-bp").getAttribute("data-measuring") === null && await page.evaluate(() => { const t = window.__emus.examples.getState().taken; return t.bp.length + t.temp.length; }) === 0, `${vp.name}: changing the time stops a measurement and clears taken readings`);
  await ex("setMinute", 360); await settle();

  // ---- Round 8: dates and times, the Prediction view, the BP list under the number
  await goDesign("icu-monitor", "monitor"); await ex("setScenario", "scn-pneumonia"); await ex("setMinute", 360); await settle();
  const topbar = await page.evaluate(() => { const d = document.querySelector(".tb-date"), c = document.querySelector(".tb-clock"); const a = d.getBoundingClientRect(), b = c.getBoundingClientRect(); return { date: d.textContent, visible: a.width > 0, gap: Math.round(b.left - a.right), same: Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 8 }; });
  check(/^\d{2}\/\d{2}\/\d{4}$/.test(topbar.date) && topbar.visible && topbar.gap >= 0 && topbar.gap < 60 && topbar.same, `${vp.name}: the date is written dd/mm/yyyy next to the time (${topbar.date}, ${topbar.gap}px apart)`);
  const bpRows = await page.evaluate(() => [...document.querySelectorAll('[data-testid="row-bp"] [data-testid^="bp-reading-"]')].map((r) => r.textContent.replace(/\s+/g, " ").trim()));
  check(bpRows.length >= 4 && bpRows.length <= 5 && bpRows.every((t, i) => t.includes(`${api360.bp_readings[i].sys}/${api360.bp_readings[i].dia}`) && t.includes(`(${api360.bp_readings[i].map})`) && /\d{2}:\d{2}/.test(t) && /\d{2}\/\d{2}/.test(t)), `${vp.name}: the last readings are listed under the BP number with time, date, sys/dia and MAP (${bpRows.length} shown)`);
  const bpNumber = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('[data-testid="row-bp"] .tile-main')).fontSize));
  check(bpNumber >= 20, `${vp.name}: the BP number is still readable with the list under it (${Math.round(bpNumber)} px)`);
  // formats are a setting
  await T("top-settings").click(); await page.getByText("Appearance").first().click();
  await T("appearance").waitFor();
  const barDate = async () => ((await page.locator("span.tb-date").textContent({ timeout: 2000 }).catch(() => "")) ?? "").trim();   // the sheet covers the bar, so read the text, not what is visible
  await page.locator('[data-testid="date-format"] [data-value="yyyy-mm-dd"]').click();
  check(/^\d{4}-\d{2}-\d{2}$/.test(await barDate()), `${vp.name}: choosing yyyy-mm-dd rewrites the date in the top bar`);
  await page.locator('[data-testid="date-format"] [data-value="mm/dd/yyyy"]').click();
  const us = await page.evaluate(() => ({ bar: document.querySelector(".tb-date").textContent, list: document.querySelector('[data-testid="row-bp"] .bp-date')?.textContent }));
  check(/^\d{2}\/\d{2}\/\d{4}$/.test(us.bar) && us.list === us.bar.slice(0, 5) || us.list === undefined || /^\d{2}\/\d{2}$/.test(us.list), `${vp.name}: mm/dd/yyyy changes every date on screen (${us.bar}, list ${us.list})`);
  await page.locator('[data-testid="clock-format"] [data-value="12h"]').click();
  check(/(AM|PM)$/.test(((await page.locator("time.tb-clock").textContent()) ?? "").trim()), `${vp.name}: 12 hour time shows AM or PM`);
  await page.locator('[data-testid="date-format"] [data-value="dd Mon yyyy"]').click();
  check(/^\d{2} [A-Z][a-z]{2} \d{4}$/.test(await barDate()), `${vp.name}: dd Mon yyyy is offered too (${await barDate()})`);
  await T("show-date").uncheck();
  check(await page.locator("span.tb-date").count() === 0, `${vp.name}: Show Date Beside The Time removes the date`);
  await page.evaluate(() => { window.__emus.ui.getState().setDraft(null); window.__emus.ui.getState().showSheet(null); });
  await settle();
  check(await page.locator("span.tb-date").count() === 1 && /^\d{2}\/\d{2}\/\d{4}$/.test(await barDate()), `${vp.name}: discarding the changes brings the default format back`);

  await T("tab-predict").click();
  await T("forecast-panel").waitFor();
  const newsNow = api360.forecast.forecasts.find((f) => f.parameter === "news2" && f.scenario === "baseline");
  const hrF = api360.forecast.forecasts.find((f) => f.parameter === "hr" && f.scenario === "baseline");
  const val = (id) => page.locator(`[data-testid="${id}"]`).getAttribute("data-value");
  check(await T("fp-news").isVisible() && await T("fp-obs").isVisible() && +(await val("fp-news-60")) === newsNow.points.find((p) => p.horizon_min === 60).value && +(await val("fp-obs-hr-120")) === hrF.points.find((p) => p.horizon_min === 120).value, `${vp.name}: the Prediction view shows the future NEWS and the future observations, as the API predicts`);
  check(await page.locator('[data-testid^="fp-obs-"][data-testid$="-60"]').count() === 5 && await T("fp-certainty-news").isVisible() && await page.locator('[data-testid^="fp-certainty-"]').count() === 6, `${vp.name}: five observations and six certainty figures (one for NEWS) are shown`);
  await T("fp-toggle-news").click();
  check(await T("fp-news").count() === 0 && await T("fp-obs").isVisible(), `${vp.name}: the Future NEWS switch hides the NEWS and leaves the observations`);
  await T("fp-toggle-news").click();
  await T("fp-toggle-obs").click();
  check(await T("fp-obs").count() === 0 && await T("fp-news").isVisible(), `${vp.name}: the Observation Predictions switch hides the observations and leaves the NEWS`);
  await T("fp-toggle-obs").click();
  await T("fp-toggle-certainty").click();
  check(await page.locator('[data-testid^="fp-certainty-"]').count() === 0 && await T("fp-news").isVisible() && await T("fp-obs").isVisible(), `${vp.name}: the Certainty switch removes every certainty figure and keeps the predictions`);
  await T("fp-toggle-news").click(); await T("fp-toggle-obs").click();
  check(await T("fp-nothing").isVisible(), `${vp.name}: with everything off it says nothing is selected`);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("emus.predict-show") ?? "{}"));
  check(kept.news === false && kept.obs === false && kept.certainty === false, `${vp.name}: the switches are this screen's choice and are kept (${JSON.stringify(kept)})`);
  await T("fp-toggle-news").click(); await T("fp-toggle-obs").click(); await T("fp-toggle-certainty").click();
  check(await page.locator('[data-testid^="fp-certainty-"]').count() === 6, `${vp.name}: switching everything back on restores the view`);
  await T("tab-monitor").click();

  // ---- Round 9: the NEWS2 Breakdown, the Prediction Overlay, the full Prediction tab
  await goDesign("icu-monitor", "monitor"); await ex("setScenario", "scn-pneumonia"); await ex("setMinute", 360); await settle();
  await page.locator('[data-parameter="news2"] [data-testid^="row-hit-"]').first().click();
  await T("news2-breakdown").waitFor();
  const comp = api360.news2.components;
  const pts = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="n2b-"][data-points]')].map((r) => +r.getAttribute("data-points")));
  const shown = +(await T("n2b-total").getAttribute("data-total"));
  check(shown === api360.news2.total && pts.reduce((a, b) => a + b, 0) === shown && shown === Object.values(comp).reduce((a, b) => a + b, 0), `${vp.name}: one touch on the NEWS box opens the breakdown and its points add up to the total (${shown})`);
  check(+(await T("n2b-temp").getAttribute("data-points")) === comp.temp && (await T("n2b-temp").textContent()).includes(api360.numerics.temp.toFixed(1)), `${vp.name}: the temperature scored is the one displayed (${api360.numerics.temp.toFixed(1)})`);
  await page.evaluate(() => window.__emus.ui.getState().showSheet(null));
  await settle();

  const half = async () => page.evaluate(() => { const L = document.querySelector('[data-testid="screen-monitor-predict"]'); const r = L.getBoundingClientRect(); const m = document.querySelector('[data-testid="row-ecg"]').getBoundingClientRect(); const p = document.querySelector('[data-testid="prediction-trends"]').getBoundingClientRect(); return { sw: r.width, mRight: m.right, pLeft: p.left, pRight: p.right, left: r.left }; });
  check(await T("tab-prediction-overlay").getAttribute("aria-pressed") === null || await T("tab-prediction-overlay").getAttribute("aria-pressed") === "false", `${vp.name}: the Prediction Overlay button starts off`);
  await T("tab-prediction-overlay").click();
  await T("prediction-trends").waitFor();
  const h = await half();
  check(h.mRight <= h.left + h.sw / 2 + 4 && h.pLeft >= h.left + h.sw / 2 - 4 && h.pRight <= h.left + h.sw + 1, `${vp.name}: the monitor is on the left half and the trends on the right half (${Math.round(h.mRight)} | ${Math.round(h.pLeft)})`);
  check(await T("tab-prediction-overlay").getAttribute("aria-pressed") === "true" && await page.locator('[data-testid^="row-"][data-parameter="spo2"]').first().isVisible() && await T("row-ecg").isVisible(), `${vp.name}: the button shows it is on, and the monitor rows are on the left`);
  const pt = await T("prediction-trends");
  check(await T("pt-axis").getAttribute("data-max") === "480" && await T("pt-axis").getAttribute("data-min") === "-240" && await T("pt-mark-480").isVisible() && await T("pt-mark--240").isVisible(), `${vp.name}: the shared time axis runs from -4 H to +8 H`);
  for (const id of ["hr", "rr", "spo2", "bp_sys", "temp"]) {
    const f = api360.forecast.forecasts.find((x) => x.parameter === id && x.scenario === "baseline");
    const endPt = f.points.find((q) => q.horizon_min === 480);
    const chart = `pt-${id}-chart`;
    const ok = await T(`${chart}-band95`).count() === 1 && await T(`${chart}-band80`).count() === 1 && await T(`${chart}-future`).count() === 1
      && +(await T(`${chart}-end`).getAttribute("data-value")) === endPt.value;
    check(ok, `${vp.name}: ${id} shows its predicted trend with 80 % and 95 % intervals, ending at the API's +8 H value (${endPt.value})`);
    check(await T(`pt-certainty-${id}`).isVisible(), `${vp.name}: ${id} shows its certainty`);
  }
  // the NEWS2 total in boxes along the bottom, over time
  const newsF = api360.forecast.forecasts.find((x) => x.parameter === "news2" && x.scenario === "baseline");
  check(+(await T("pt-box-0").getAttribute("data-value")) === api360.news2.total && await T("pt-certainty-news").isVisible(), `${vp.name}: the NEWS2 box for now shows the live total (${api360.news2.total}) and its certainty`);
  check(+(await T("pt-box-480").getAttribute("data-value")) === Math.round(newsF.points.find((q) => q.horizon_min === 480).value) && await T("pt-box-480").getAttribute("data-kind") === "future", `${vp.name}: a predicted NEWS2 box at +8 H matches the API`);
  const pastBoxes = await page.locator('[data-testid^="pt-box-"][data-kind="past"]').count();
  check(pastBoxes >= 1 && await page.locator('[data-testid^="pt-box-"][data-kind="future"]').count() >= 3, `${vp.name}: charted NEWS2 totals and predicted ones are boxed along the time axis (${pastBoxes} charted)`);
  const bx = await page.evaluate(() => { const a = document.querySelector('[data-testid="pt-box-0"]').getBoundingClientRect(), m = document.querySelector('[data-testid="pt-mark-0"]').getBoundingClientRect(), c = document.querySelector('[data-testid="pt-hr-chart-now"]')?.getBoundingClientRect(); return { box: (a.left + a.right) / 2, mark: (m.left + m.right) / 2 }; });
  check(Math.abs(bx.box - bx.mark) <= 2, `${vp.name}: the Now box sits exactly over the Now mark of the time axis`);
  // each predicted chart is level with the monitor row beside it
  const level = await page.evaluate(() => [["row-ecg", "pt-hr"], ["row-spo2", "pt-spo2"], ["row-resp", "pt-rr"], ["row-bp", "pt-bp_sys"], ["row-temp", "pt-temp"], ["row-news", "pt-news"]]
    .map(([a, b]) => { const r = document.querySelector(`[data-testid="${a}"]`).getBoundingClientRect(), c = document.querySelector(`[data-testid="${b}"]`).getBoundingClientRect(); return [a, Math.round(Math.abs(r.top - c.top)), Math.round(Math.abs(r.height - c.height))]; }));
  check(level.every(([, dt, dh]) => dt <= 2 && dh <= 2), `${vp.name}: every predicted chart has the same top and height as its monitor row (${JSON.stringify(level)})`);
  await T("fp-toggle-certainty").click();
  check(await page.locator('[data-testid^="pt-certainty-"]').count() === 0, `${vp.name}: the Certainty switch works on the overlay`);
  await T("fp-toggle-certainty").click();
  await T("fp-toggle-news").click();
  await T("tab-predict").click(); await T("forecast-panel").waitFor();
  check(await T("fp-news").count() === 0, `${vp.name}: the overlay's switches are the Prediction view's too`);
  await T("fp-toggle-news").click();
  await T("tab-prediction-overlay").click();
  await T("prediction-trends").waitFor();
  await T("tab-prediction-overlay").click();
  await settle();
  check(await T("tab-prediction-overlay").getAttribute("aria-pressed") === "false" && await page.locator('[data-testid="screen-monitor-predict"]').count() === 0, `${vp.name}: pressing the button again goes back to the screen it came from`);

  // the Prediction tab: AI findings and events
  await T("tab-predict").click(); await T("ai-summary").waitFor();
  const active = api360.findings.filter((f) => f.status === "active").length;
  check(+(await T("ai-summary").getAttribute("data-count")) === Math.min(6, active) && await page.locator('[data-testid^="ais-"][data-status="active"]').count() === Math.min(6, active), `${vp.name}: What the AI Sees Now lists the ${active} active findings`);
  await page.locator('[data-testid^="ais-"][data-status="active"]').first().click();
  check(await page.evaluate(() => window.__emus.ui.getState().openSheet) === "finding-explain", `${vp.name}: one touch on a finding opens its Why sheet`);
  await page.evaluate(() => window.__emus.ui.getState().showSheet(null));
  await settle();
  const evs = api360.forecast.events;
  check(await page.locator('[data-testid^="evt-row-"]').count() === evs.length && evs.every((e) => true), `${vp.name}: the events timeline lists the ${evs.length} predicted events`);
  const evProb = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="evt-row-"]')].map((r) => +r.getAttribute("data-probability")));
  check(evs.every((e) => evProb.includes(e.probability)), `${vp.name}: each event shows the API's probability`);
  await T("tab-monitor").click();

  // Nothing overlaps, nothing is cut off, everything has padding; and the words are capitalised
  const { audit } = require("./layout-audit.cjs");
  const { capsAudit } = require("./caps-audit.cjs");
  for (const [d, sc, scen, min] of [["icu-monitor", "monitor", "scn-af", 20], ["icu-modules", "monitor", "scn-pneumonia", 180], ["icu-monitor", "abcde", "scn-copd", -20], ["icu-monitor", "predict", "scn-pneumonia", 120], ["icu-monitor", "monitor-predict", "scn-pneumonia", 360]]) {
    await goDesign(d, sc); await ex("setScenario", scen); await ex("setMinute", min); await settle();
    const r = await audit(page);
    check(r.problems.length === 0, `${vp.name}: ${d}/${sc} has no overlaps, cut-off text or missing padding ${r.problems.slice(0, 3).join(" | ")}`);
    const c = await capsAudit(page);
    check(c.length === 0, `${vp.name}: ${d}/${sc} words are capitalised ${c.slice(0, 3).join(" | ")}`);
  }
  await goDesign("icu-monitor");

  check(errors.length === 0, `${vp.name}: no page errors ${errors.join(" | ")}`);
  await context.close();
}
await browser.close();

if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log("\nall checks passed");
}

main().catch((e) => { console.error(e); process.exit(1); });
