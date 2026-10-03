// Screenshot static pages in light and dark, desktop and phone, and report console errors.
// usage: node scripts/shot-pages.mjs https://shunt-eight.vercel.app /proof /research
import { chromium } from "playwright";

const [base, ...paths] = process.argv.slice(2);
const out = "../bitget-t3-launch/shots";
const browser = await chromium.launch();
for (const p of paths) {
  for (const scheme of ["light", "dark"]) {
    for (const [name, vp] of [["desktop", { width: 1440, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
      const page = await browser.newPage({ viewport: vp, colorScheme: scheme });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      const res = await page.goto(base + p, { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);
      const file = `${out}/page${p.replace(/\//g, "-")}-${scheme}-${name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      console.log(p, scheme, name, res?.status(), overflow ? "HORIZONTAL OVERFLOW" : "", errors.length ? "ERRORS: " + errors.join(" | ") : "ok");
      await page.close();
    }
  }
}
await browser.close();
