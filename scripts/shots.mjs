// Drive the real page in a headless browser: press an example, wait for the answer, screenshot light and dark.
// usage: node scripts/shots.mjs [baseUrl] [exampleIndex] [outDir]
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3210";
const ex = Number(process.argv[3] ?? 0);
const out = process.argv[4] ?? "../bitget-t3-launch/shots";
const browser = await chromium.launch();
for (const scheme of ["light", "dark"]) {
  for (const [name, vp] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport: vp, colorScheme: scheme });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(base, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${out}/home-${scheme}-${name}.png` });
    const rows = page.getByRole("listitem");
    await rows.nth(ex).click();
    await page.waitForSelector("h2", { timeout: 60000 });
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${out}/result-${ex}-${scheme}-${name}.png`, fullPage: true });
    const h2 = await page.locator("h2").first().textContent();
    console.log(scheme, name, "verdict:", h2, errors.length ? "ERRORS: " + errors.join(" | ") : "no console errors");
    await page.close();
  }
}
await browser.close();
