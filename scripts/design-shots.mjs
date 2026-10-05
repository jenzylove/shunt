// Render the whole site as a visitor sees it: scroll so every section reveals, then screenshot light/dark, desktop/phone.
// usage: node scripts/design-shots.mjs <baseUrl> <outDir>
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://localhost:3210";
const out = process.argv[3] ?? "../bitget-t3-launch/shots/design";
const browser = await chromium.launch();

async function reveal(page) {
  await page.evaluate(async () => {
    const h = document.documentElement.scrollHeight;
    for (let y = 0; y < h; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(900);
}

for (const scheme of ["light", "dark"]) {
  for (const [name, vp] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport: vp, colorScheme: scheme });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(base, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${out}/home-top-${scheme}-${name}.png` });
    await reveal(page);
    await page.screenshot({ path: `${out}/home-full-${scheme}-${name}.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    // a real check through the real form
    await page.getByRole("listitem").nth(0).click();
    await page.waitForSelector("h2", { timeout: 60000 });
    await page.waitForTimeout(2200);
    await reveal(page);
    await page.screenshot({ path: `${out}/result-${scheme}-${name}.png`, fullPage: true });
    const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    console.log(scheme, name, "overflow", overflow, overflow2, errors.length ? errors : "no errors");
    await page.close();
  }
}
for (const path of ["/proof", "/research"]) {
  for (const scheme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: scheme });
    await page.goto(base + path, { waitUntil: "networkidle" });
    await reveal(page);
    await page.screenshot({ path: `${out}/page${path.replace("/", "-")}-${scheme}-desktop.png`, fullPage: true });
    await page.close();
  }
}
await browser.close();
