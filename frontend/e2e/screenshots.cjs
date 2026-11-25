// Regenerates the pictures in docs/screenshots from the example data.
//   node e2e/screenshots.cjs [baseUrl]      (default http://127.0.0.1:8123, a server on a fresh database)
// Run it with `make screenshots`, which starts that server for you.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.argv[2] ?? process.env.EMUS_URL ?? "http://127.0.0.1:8123";
const OUT = path.join(__dirname, "..", "..", "docs", "screenshots");

// [file, screen, minute, width, height, options]
const SHOTS = [
  ["01-monitor", "monitor", 360, 1280, 800, { hold: true }],
  ["02-prediction-overlay", "monitor-predict", 360, 1280, 800, { hold: true }],
  ["03-news2-chart", "news2", 360, 1280, 800, {}],
  ["04-abcde", "abcde", 360, 1280, 800, {}],
  ["05-predict-tab", "predict", 360, 1280, 800, {}],
  ["06-alarm-highlight", "monitor", 480, 1280, 800, { hold: true, clip: { x: 1050, y: 70, width: 230, height: 545 } }],
  ["07-news2-light", "news2", 360, 1280, 800, { light: true }],
  ["08-news2-breakdown", "monitor", 360, 1280, 800, { sheet: "news2-breakdown" }],
  ["09-monitor-small", "monitor", 360, 1024, 768, { hold: true }],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const errors = [];
  for (const [file, screen, minute, width, height, o] of SHOTS) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${file}: ${e.message}`));
    await page.addInitScript(([m]) => { localStorage.setItem("emus.example", JSON.stringify({ enabled: true, scenario: "scn-pneumonia", minute: m })); }, [minute]);
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate((s) => window.__emus.ui.setState({ screenId: s, openSheet: null }), screen);
    await page.waitForFunction(() => window.__emus.examples.getState().status === "ready", null, { timeout: 15000 });
    if (o.light) await page.getByTestId("top-theme").click();
    if (o.sheet) await page.evaluate((s) => window.__emus.ui.getState().showSheet(s), o.sheet);
    await page.waitForTimeout(1500);
    // hold alarming numbers in their highlighted phase, so the picture is the same every time
    if (o.hold) await page.addStyleTag({ content: ".tile-num.is-alarm { background: currentColor; } .tile-num.is-alarm > .tile-num-t { color: #fff; text-shadow: 0 0 2px rgba(0,0,0,.7); } .tile-num.is-alarm[data-ink=dark] > .tile-num-t { color: #000; text-shadow: none; }" });
    await page.screenshot({ path: path.join(OUT, `${file}.png`), ...(o.clip ? { clip: o.clip } : {}) });
    await context.close();
    console.log("wrote", file);
  }
  await browser.close();
  const bad = SHOTS.filter(([f]) => !fs.existsSync(path.join(OUT, `${f}.png`)) || fs.statSync(path.join(OUT, `${f}.png`)).size < 20000);
  if (errors.length || bad.length) { console.error("problems:", errors.join(" | "), bad.map((b) => b[0]).join(",")); process.exit(1); }
  const readme = fs.readFileSync(path.join(__dirname, "..", "..", "README.md"), "utf8");
  const missing = [...readme.matchAll(/\(docs\/screenshots\/([^)]+)\)/g)].map((m) => m[1]).filter((f) => !fs.existsSync(path.join(OUT, f)));
  if (missing.length) { console.error("README links to missing pictures:", missing.join(", ")); process.exit(1); }
  console.log("all pictures written");
})().catch((e) => { console.error(e); process.exit(1); });
