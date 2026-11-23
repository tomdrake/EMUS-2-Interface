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
  check(top.map((b) => b.id).join() === "top-new-patient,top-discharge,top-theme,top-settings",
        `${vp.name}: top bar has new patient, discharge, dark / light and settings, in that order`);
  check(top.at(-1).icon === "settings" && top.at(-1).right >= vp.width - 2 && top.at(-1).top < 10,
        `${vp.name}: settings is a cog at the top right`);
  check(await T("tab-settings").count() === 0, `${vp.name}: settings is no longer in the tab bar`);
  const clockBox = await box('[data-testid="clock"]');
  check(clockBox[0] + clockBox[2] <= top[0].right && clockBox[2] > 0, `${vp.name}: clock is visible beside the top buttons`);

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
  // Rows are short by design on small screens; M2 must keep them tappable.
  const offenders = small.filter((s) => !/^row-/.test(s));
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
      cellsPerRow: new Set(all(".row:not(.row-spacer)").map((r) => r.querySelectorAll(".tile").length)).size,
      columns: new Set(all(".tile").map((t) => Math.round(rect(t).left))).size,
      slots: Number(getComputedStyle(q(".rows")).getPropertyValue("--tile-slots")),
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
  check(align.cellsPerRow === 1 && align.columns === align.slots && align.tileRight <= 0.5,
        `${vp.name}: every row has the same tile cells, in straight columns`);
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

  // The box headlines the most serious problem and counts the rest.
  check(/connection lost/i.test(await T("notif-text").innerText()), `${vp.name}: the box headlines the most serious problem`);
  check(await T("notif-count").innerText() === "+1", `${vp.name}: the box counts the others`);
  check(/MONITOR/.test(await T("notifications").innerText()), `${vp.name}: monitoring problems are tagged MONITOR`);
  check(await layout() === before, `${vp.name}: problems appearing did not move or resize anything`);
  await shot("failure-modes");

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

  // ===== milestone checks are added below this line =====

  check(errors.length === 0, `${vp.name}: no page errors ${errors.join(" | ")}`);
  await context.close();
}
await browser.close();

if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log("\nall checks passed");
}

main().catch((e) => { console.error(e); process.exit(1); });
