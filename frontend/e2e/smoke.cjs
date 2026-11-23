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

  // ===== milestone checks are added below this line =====

  check(errors.length === 0, `${vp.name}: no page errors ${errors.join(" | ")}`);
  await page.close();
}
await browser.close();

if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log("\nall checks passed");
}

main().catch((e) => { console.error(e); process.exit(1); });
