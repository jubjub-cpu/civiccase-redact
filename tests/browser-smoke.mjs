import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const port = Number(process.env.CIVICCASE_TEST_PORT || 4213);
const deployed = process.env.CIVICCASE_BASE_URL?.trim();
const base = deployed ? `${deployed.replace(/\/$/, "")}/` : `http://127.0.0.1:${port}/`;
const target = process.env.PLAYWRIGHT_MODULE || "playwright";
const specifier = /^[A-Za-z]:[\\/]/.test(target) ? pathToFileURL(target).href : target;
const { chromium } = await import(specifier);
const desktopShot = fileURLToPath(new URL("../docs/screenshots/civiccase-redact-desktop.png", import.meta.url));
const mobileShot = fileURLToPath(new URL("../docs/screenshots/civiccase-redact-mobile.png", import.meta.url));
const importPath = fileURLToPath(new URL("../data/local-import-sample.txt", import.meta.url));
const server = deployed ? null : spawn(process.execPath, ["tools/static-server.mjs", "--port", String(port)], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });

async function ready() {
  for (let attempt = 0; attempt < 35; attempt += 1) {
    try { if ((await fetch(base)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error("CivicCase server did not start");
}

let browser;
try {
  await ready();
  browser = await chromium.launch({ headless: true });
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await desktop.newPage();
  const errors = [];
  const failed = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => failed.push(request.url()));
  await page.goto(base, { waitUntil: "networkidle" });
  assert.equal(await page.locator("[data-case]").count(), 4);
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("skip-link")), true);
  await page.keyboard.press("Enter");
  assert.equal(await page.evaluate(() => location.hash), "#workspace");
  assert.match(await page.locator("#review-heading").innerText(), /CASE-2026-0417/);
  assert.equal(await page.locator("[data-finding]").count(), 7);
  assert.equal(await page.locator("#source-text mark").count(), 7);
  assert.match(await page.locator("#preview-text").innerText(), /\[PERSON\?\]/);
  assert.match(await page.locator("#release-summary").innerText(), /7 findings remain pending/);
  assert.equal(await page.locator("#export-bundle").isDisabled(), true);
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: desktopShot, fullPage: true });

  await page.locator("#redact-high").click();
  assert.match(await page.locator("#metric-strip").innerText(), /PENDING\s+3/i);
  const firstPerson = page.locator('[data-finding^="person-"]').first();
  await firstPerson.getByRole("button", { name: "Keep" }).click();
  assert.match(await page.locator("#metric-strip").innerText(), /KEEP\s+1/i);
  assert.match(await page.locator("#preview-text").innerText(), /Avery Example/);
  await page.locator("#redact-all").click();
  assert.match(await page.locator("#release-summary").innerText(), /All findings reviewed/);
  await page.locator("#release-document").click();
  assert.match(await page.locator("#release-error").innerText(), /12-character/);
  await page.locator("#reviewer-note").fill("Synthetic direct identifiers reviewed for public release.");
  await page.locator("#release-document").click();
  assert.match(await page.locator("#release-summary").innerText(), /released by human reviewer/i);
  assert.equal(await page.locator("#export-bundle").isEnabled(), true);
  const jsonDownload = page.waitForEvent("download");
  await page.locator("#export-bundle").click();
  assert.match((await jsonDownload).suggestedFilename(), /civiccase-release\.json$/);
  const textDownload = page.waitForEvent("download");
  await page.locator("#download-text").click();
  assert.match((await textDownload).suggestedFilename(), /civiccase-protected\.txt$/);
  await page.locator("#return-review").click();
  assert.equal(await page.locator("#export-bundle").isDisabled(), true);

  await page.locator("#minConfidence").evaluate((input) => { input.value = "0.95"; input.dispatchEvent(new Event("change", { bubbles: true })); });
  assert.equal(await page.locator("[data-finding]").count(), 4);
  await page.locator("#reset-policy").click();
  assert.equal(await page.locator("[data-finding]").count(), 7);
  await page.locator("#manual-phrase").fill("temporary housing support");
  await page.locator("#manual-form button[type=submit]").click();
  assert.equal(await page.locator("[data-finding]").count(), 8);
  assert.match(await page.locator("#metric-strip").innerText(), /MANUAL\s+1/i);

  await page.locator('[data-case="deidentified-control"]').click();
  assert.equal(await page.locator("[data-finding]").count(), 0);
  assert.match(await page.locator("#findings-list").innerText(), /No configured direct identifiers detected/);
  await page.locator("#text-import").setInputFiles(importPath);
  await page.locator('[data-case^="local-"]').waitFor({ state: "visible" });
  assert.equal(await page.locator("[data-case]").count(), 5);
  assert.equal(await page.locator("[data-finding]").count(), 5);
  assert.match(await page.locator("#audit-list").innerText(), /Local text opened/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(base, { waitUntil: "networkidle" });
  await mobilePage.locator("#redact-all").click();
  assert.match(await mobilePage.locator("#release-summary").innerText(), /All findings reviewed/);
  assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth), false);
  await mobilePage.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await mobilePage.screenshot({ path: mobileShot, fullPage: true });
  await mobile.close();

  const errorContext = await browser.newContext();
  const errorPage = await errorContext.newPage();
  await errorPage.route("**/data/cases.json", (route) => route.abort());
  await errorPage.goto(base, { waitUntil: "domcontentloaded" });
  await errorPage.getByRole("heading", { name: "The synthetic case-note fixtures could not be prepared." }).waitFor({ state: "visible" });
  assert.equal(await errorPage.getByRole("button", { name: "Retry" }).isVisible(), true);
  await errorContext.close();

  console.log("CIVICCASE BROWSER TESTS PASSED");
  console.log(JSON.stringify({ target: deployed ? "deployed" : "local", fixtures: 4, directIdentifierTypes: 7, offsetSpans: true, repeatedNames: true, reversibleReview: true, policyControls: true, manualRedaction: true, localImport: true, protectedPreview: true, humanGate: true, jsonExport: true, textExport: true, keyboard: true, desktopOverflow: false, mobileOverflow: false, consoleErrors: 0, failedRequests: 0 }));
} finally {
  if (browser) await browser.close();
  if (server) server.kill();
}
