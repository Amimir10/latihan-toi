import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const playwrightUrl = pathToFileURL("C:\\Users\\ThinkPad\\AppData\\Local\\Temp\\opencode\\pw\\node_modules\\playwright\\index.mjs").href;
const { chromium } = await import(playwrightUrl);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const shotDir = path.join(root, "screenshots", "header");
fs.mkdirSync(shotDir, { recursive: true });

const args = process.argv.slice(2);
const label = args.includes("--label") ? args[args.indexOf("--label") + 1] : "audit";
const widths = (args.includes("--widths") ? args[args.indexOf("--widths") + 1] : "1920,1440,1280,1024,768,640,639,390").split(",").map(Number).filter(Boolean);
const themes = (args.includes("--themes") ? args[args.indexOf("--themes") + 1] : "light,dark").split(",").filter(Boolean);
const port = 4174;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const server = http.createServer((req, res) => {
  const raw = decodeURIComponent((req.url || "/").split("?")[0].split("#")[0]);
  const relative = raw === "/" ? "index.html" : raw.replace(/^\/+/, "");
  const file = path.resolve(root, relative);
  if (!file.startsWith(root)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});
await new Promise((resolve) => server.listen(port, resolve));

const browser = await chromium.launch({ headless: true });

async function auditCase(theme, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  await page.addInitScript((value) => {
    localStorage.setItem("asas-gasal-jawa-xi-v1", JSON.stringify({ theme: value }));
  }, theme);
  await page.goto(`http://127.0.0.1:${port}/#/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector(".topbar", { state: "visible" });
  await page.waitForTimeout(200);

  const report = await page.evaluate(() => {
    const pick = (el, props) => Object.fromEntries(props.map((prop) => [prop, getComputedStyle(el)[prop]]));
    const rectOf = (el) => {
      const r = el.getBoundingClientRect();
      return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1), right: +r.right.toFixed(1) };
    };
    const ids = ["creatorLoginBtn", "themeToggleBtn", "scheduleDateBadge", "themeLabel", "themeIcon"];
    const elements = Object.fromEntries(ids.map((id) => {
      const el = document.getElementById(id);
      return [id, el ? {
        rect: rectOf(el),
        text: el.textContent.trim(),
        visible: getComputedStyle(el).display !== "none",
        ...pick(el, ["display", "borderRadius", "minWidth", "width", "height", "padding", "fontSize", "color"])
      } : null];
    }));
    const header = document.querySelector(".topbar");
    const inner = header.querySelector("div");
    return {
      theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
      viewport: { width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth },
      header: { rect: rectOf(header), ...pick(header, ["height", "position", "zIndex", "overflowX"]) },
      inner: { ...pick(inner, ["flexWrap", "flexDirection", "gap", "justifyContent"]), rect: rectOf(inner) },
      elements,
      labels: {
        creatorLabelVisible: getComputedStyle(document.querySelector("#creatorLoginBtn span:last-child")).display !== "none",
        themeLabelVisible: getComputedStyle(document.getElementById("themeLabel")).display !== "none",
        versionText: "",
        creatorGlyph: document.querySelector("#creatorLoginBtn span:first-child").textContent.trim(),
        themeAria: document.getElementById("themeToggleBtn").getAttribute("aria-label")
      }
    };
  });

  const name = `${label}-${theme}-${width}`;
  await page.locator(".topbar").screenshot({ path: path.join(shotDir, `${name}-header.png`) });
  await page.screenshot({ path: path.join(shotDir, `${name}-viewport.png`), fullPage: false });
  await context.close();
  return { name, ...report };
}

const results = [];
for (const theme of themes) {
  for (const width of widths) {
    results.push(await auditCase(theme, width));
  }
}

fs.writeFileSync(path.join(shotDir, `${label}-report.json`), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.map((r) => ({
  name: r.name,
  headerHeight: r.header.rect.height,
  pageOverflow: r.viewport.scrollWidth - r.viewport.width,
  headerWrap: r.inner.flexWrap,
  creator: `${r.elements.creatorLoginBtn.rect.width}x${r.elements.creatorLoginBtn.rect.height} r=${r.elements.creatorLoginBtn.borderRadius}`,
  theme: `${r.elements.themeToggleBtn.rect.width}x${r.elements.themeToggleBtn.rect.height} r=${r.elements.themeToggleBtn.borderRadius}`,
  label: r.elements.themeLabel.text,
  labelVisible: r.elements.themeLabel.visible,
  versionVisible: false,
  glyph: r.labels.creatorGlyph
})), null, 2));
await browser.close();
server.close();
