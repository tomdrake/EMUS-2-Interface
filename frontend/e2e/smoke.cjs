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
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByTestId("app").waitFor();
  // Wait out the 140 ms open animation so menus and sheets are fully drawn.
  const shot = async (name) => {
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(OUT, `${vp.name}-${name}.png`) });
  };

  // --- required chrome
  check(await page.getByTestId("patient-name").isVisible(), `${vp.name}: patient name is shown`);
  check(/^\d{2}:\d{2}/.test(await page.getByTestId("clock").innerText()), `${vp.name}: clock is shown`);
  check(await page.getByTestId("silence").isVisible(), `${vp.name}: silence button is shown`);
  check(await page.getByTestId("tab-settings").isVisible(), `${vp.name}: settings button is shown`);
  const nav = await page.locator("nav.tabbar").boundingBox();
  check(nav && nav.y + nav.height >= vp.height - 1, `${vp.name}: tabs are along the bottom`);

  // --- touch targets
  const small = await page.locator("button:visible").evaluateAll((els, min) => els
    .map((e) => ({ id: e.dataset.testid ?? e.textContent?.trim().slice(0, 20), r: e.getBoundingClientRect() }))
    .filter((x) => x.r.width < min || x.r.height < min)
    .map((x) => `${x.id} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`), MIN_TOUCH);
  // Rows are short by design on small screens; M2 must keep them tappable.
  const offenders = small.filter((s) => !/^row-/.test(s));
  check(offenders.length === 0, `${vp.name}: touch targets >= ${MIN_TOUCH}px ${offenders.join(", ")}`);

  // --- no horizontal overflow
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        `${vp.name}: no horizontal overflow`);
  await shot("home");

  // --- one touch: screens
  await page.getByTestId("tab-news2").click();
  check(await page.getByTestId("screen-news2").isVisible(), `${vp.name}: NEWS2 screen in one touch`);
  await shot("news2");

  // --- two touches: menu -> split screen
  await page.getByTestId("tab-split").click();
  check(await page.getByTestId("menu-views").isVisible(), `${vp.name}: views menu opens`);
  await shot("menu-views");
  await page.getByTestId("menu-item-side").click();
  check(await page.getByTestId("screen-split-h").isVisible(), `${vp.name}: side-by-side split in two touches`);
  check(await page.getByTestId("split").evaluate((e) => e.classList.contains("split-horizontal")),
        `${vp.name}: split is horizontal`);
  await shot("split-h");
  await page.getByTestId("tab-split").click();
  await page.getByTestId("menu-item-stacked").click();
  check(await page.getByTestId("split").evaluate((e) => e.classList.contains("split-vertical")),
        `${vp.name}: stacked split is vertical`);
  await shot("split-v");

  // --- two touches: settings -> a studio section
  await page.getByTestId("tab-settings").click();
  check(await page.getByTestId("menu-settings").isVisible(), `${vp.name}: settings menu opens`);
  await shot("menu-settings");
  await page.getByTestId("menu-item-appearance").click();
  check(await page.getByTestId("sheet-studio-appearance").isVisible(), `${vp.name}: appearance in two touches`);
  await page.getByTestId("sheet-close").click();

  // --- row tap opens its panel
  await page.getByTestId("tab-monitor").click();
  await page.getByTestId("row-ecg").click();
  check(await page.getByTestId("sheet-alarm-limits").isVisible(), `${vp.name}: row tap opens alarm limits`);
  await page.getByTestId("sheet-close").click();

  // --- safety states (driven through the test handle until the simulator can inject them)
  const numerics = () => page.locator(".num").allInnerTexts();
  check(!(await numerics()).some((t) => /--/.test(t)), `${vp.name}: no numeric ever shows dashes`);

  // Keep the screen "live" for the next checks: the watchdog marks it stale after 3 s of silence.
  await page.evaluate(() => {
    const s = window.__emus.safety;
    window.__beat = setInterval(() => s.getState().heartbeat(), 400);
    s.getState().heartbeat();
    const t = new Date().toISOString();
    const sig = (parameter, state, extra = {}) => [parameter, { parameter, state, since: t, advice: "", ...extra }];
    s.getState().setDevices(
      [
        { id: "anne-chest", label: "Chest sensor", kind: "anne-chest", connection: "connected", battery: "ok", battery_pct: 71, parameters: [], waveforms: [] },
        { id: "anne-limb", label: "Limb sensor", kind: "anne-limb", connection: "lost", battery: "low", battery_pct: 18, last_seen: new Date(Date.now() - 42000).toISOString(), parameters: [], waveforms: [] },
        { id: "bp-cuff", label: "BP cuff", kind: "bp-cuff", connection: "not-paired", battery: "unknown", battery_pct: null, parameters: [], waveforms: [] },
      ],
      Object.fromEntries([
        sig("hr", "poor-signal", { issue: "motion", device_id: "anne-chest", quality: 0.4 }),
        sig("rr", "sensor-off", { device_id: "anne-chest", advice: "Check the sensor is attached" }),
        sig("spo2", "connection-lost", { device_id: "anne-limb" }), sig("pulse", "connection-lost", { device_id: "anne-limb" }),
        sig("temp", "acquiring", { device_id: "anne-chest" }),
        sig("bp_sys", "standby"), sig("bp_dia", "standby"), sig("bp_mean", "standby"),
      ]));
    s.getState().setAlarms({ active: [
      { id: "t1", kind: "technical", technical: "connection-lost", priority: "medium", device_id: "anne-limb", parameter: null,
        message: "Limb sensor: connection lost. Not monitoring SpO2, PR.", started_at: t },
      { id: "t2", kind: "technical", technical: "battery-low", priority: "low", device_id: "anne-limb", parameter: null,
        message: "Limb sensor: battery 18%.", started_at: t },
    ], silenced_until: null, silence_seconds: 120, alarms_off: [], unmonitored: ["spo2", "pulse"] });
  });
  const state = (p) => page.getByTestId(`num-${p}`).getAttribute("data-state");
  const text = (p) => page.getByTestId(`num-${p}`).innerText();
  check(await state("bp_sys") === "standby" && /STANDBY/.test(await text("bp_sys")), `${vp.name}: a modality with no device says STANDBY`);
  check(/CONNECTION LOST/.test(await text("spo2")), `${vp.name}: a lost wireless link says CONNECTION LOST`);
  check(/CHECK SENSOR/.test(await text("rr")), `${vp.name}: a sensor off the patient says CHECK SENSOR`);
  check(/SEARCHING/.test(await text("temp")), `${vp.name}: a device still acquiring says SEARCHING`);
  check(/POOR TRACE/.test(await page.getByTestId("row-status-hr").innerText()) && /moving/i.test(await page.getByTestId("row-status-hr").innerText()),
        `${vp.name}: a noisy trace says POOR TRACE with what to check`);
  const words = new Set(await Promise.all(["bp_sys", "spo2", "rr", "temp"].map(text)).then((a) => a.map((x) => x.split("\n")[0])));
  check(words.size === 4, `${vp.name}: each failure mode reads differently`);
  check(/no signal 0:4\d/i.test(await page.getByTestId("device-anne-limb").innerText()),
        `${vp.name}: a lost device says so in words with how long`);
  check(/^Limb sensor/.test(await page.getByTestId("devices").innerText()), `${vp.name}: the device with a problem is listed first`);
  check(/CONNECTION LOST \d:\d\d/.test(await page.getByTestId("row-status-spo2").innerText()), `${vp.name}: the row counts how long the connection has been lost`);
  const tb = await page.evaluate(() => {
    const r = (sel) => document.querySelector(sel).getBoundingClientRect();
    const clock = r('[data-testid="clock"]'), dev = r(".tb-devices"), badge = r(".badge-proto");
    return { overlap: dev.right > clock.left + 1, clockVisible: clock.right <= badge.left + 1 && clock.width > 0 };
  });
  check(!tb.overlap && tb.clockVisible, `${vp.name}: top bar fields do not overlap the clock`);
  const cut = await page.locator(".device").evaluateAll((els) => {
    const box = document.querySelector(".tb-devices").getBoundingClientRect();
    return els.map((e) => e.getBoundingClientRect())
      .filter((r) => r.top < box.bottom && r.right > box.right + 1).length;
  });
  check(cut === 0, `${vp.name}: no device chip is cut off mid-word`);
  check(/standby/i.test(await page.getByTestId("device-bp-cuff").innerText()), `${vp.name}: an unconnected device says standby`);
  const sys = await page.getByTestId("system-banner").innerText();
  check(/MONITOR/.test(sys) && /connection lost/i.test(sys) && /battery 18%/i.test(sys), `${vp.name}: monitoring problems are listed and tagged MONITOR`);
  await shot("failure-modes");

  // --- alarm sound paused: yellow button, banner with countdown, says alarms still show
  await page.evaluate(() => window.__emus.safety.getState().setSilencedUntil(new Date(Date.now() + 120000).toISOString()));
  const banner = page.getByTestId("silence-banner");
  await banner.waitFor();
  const bannerText = await banner.innerText();
  check(/ALARM SOUND PAUSED/.test(bannerText) && /Alarms still show/.test(bannerText), `${vp.name}: paused banner says what is and is not affected`);
  check(/^(2:00|1:5\d)$/.test(await page.getByTestId("silence-count").innerText()), `${vp.name}: paused banner counts down from two minutes`);
  const yellow = await page.evaluate(() => {
    const want = getComputedStyle(document.documentElement).getPropertyValue("--c-silenced").trim().toLowerCase();
    const hex = (rgb) => "#" + rgb.match(/\d+/g).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("");
    const btn = getComputedStyle(document.querySelector('[data-testid="silence"]')).backgroundColor;
    const ban = getComputedStyle(document.querySelector('[data-testid="silence-banner"]')).backgroundColor;
    return { want, btn: hex(btn), ban: hex(ban) };
  });
  check(yellow.btn === yellow.want && yellow.ban === yellow.want, `${vp.name}: silence button and banner are solid ${yellow.want}`);
  check(/Paused (2:00|1:5\d)/.test(await page.getByTestId("silence").innerText()), `${vp.name}: silence button shows the time left`);
  check(/Sound paused/.test(await page.getByTestId("alarm-status").innerText()), `${vp.name}: top bar says sound is paused`);
  check((await page.getByTestId("system-banner").innerText()).length > 0, `${vp.name}: pausing sound does not hide monitoring problems`);
  await shot("sound-paused");
  await page.evaluate(() => window.__emus.safety.getState().setSilencedUntil(null));
  check(await banner.count() === 0, `${vp.name}: banner goes when sound resumes`);

  // --- a screen that stops receiving must not look live
  await page.evaluate(() => clearInterval(window.__beat));
  await page.waitForFunction(() => document.querySelector('[data-testid="app"]').dataset.link === "stale", null, { timeout: 8000 });
  check((await numerics()).every((t) => /NO DATA/.test(t)), `${vp.name}: every numeric says NO DATA when the screen stops updating`);
  const stale = await page.getByTestId("system-banner").innerText();
  check(/not updating/i.test(stale) && !/battery/i.test(stale), `${vp.name}: the screen says it is not updating and repeats nothing stale`);
  check(/no data/i.test(await page.getByTestId("alarm-status").innerText()), `${vp.name}: alarm status admits it has no data`);
  await shot("not-updating");

  // ===== milestone checks are added below this line =====

  check(errors.length === 0, `${vp.name}: no page errors ${errors.join(" | ")}`);
  await page.close();
}
await browser.close();

if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log("\nall checks passed");
}

main().catch((e) => { console.error(e); process.exit(1); });
