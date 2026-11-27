import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const playwrightUrl = pathToFileURL("C:\\Users\\ThinkPad\\AppData\\Local\\Temp\\opencode\\pw\\node_modules\\playwright\\index.mjs").href;
const { chromium } = await import(playwrightUrl);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const shotDir = path.join(root, "screenshots", "intro");
fs.mkdirSync(shotDir, { recursive: true });

const args = process.argv.slice(2);
const value = (flag, fallback) => args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
const label = value("--label", "audit");
const subjects = value("--subjects", "pendidikan-pancasila,bahasa-indonesia,bahasa-inggris,bahasa-jawa,mata-pelajaran-pilihan,pjok,pendidikan-agama,kreativitas-inovasi-kewirausahaan").split(",").filter(Boolean);
const widths = value("--widths", "1440,1024,768,390").split(",").map(Number).filter(Boolean);
const themes = value("--themes", "light,dark").split(",").filter(Boolean);
const port = 4175;

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

async function auditCase(theme, width, subject) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  await page.addInitScript((value) => {
    localStorage.setItem("asas-gasal-jawa-xi-v1", JSON.stringify({ theme: value }));
  }, theme);
  const url = `http://127.0.0.1:${port}/#/mapel/${subject}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      break;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
  await page.waitForSelector("#introPage:not(.hidden)", { state: "visible" });
  await page.waitForTimeout(200);

  const report = await page.evaluate(() => {
    const rectOf = (el) => {
      const r = el.getBoundingClientRect();
      return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1) };
    };
    const style = (el, prop) => getComputedStyle(el)[prop];
    const ids = ["introSubjectName", "introSubjectSchedule", "introExamBadge", "introStartBtn"];
    const key = Object.fromEntries(ids.map((id) => {
      const el = document.getElementById(id);
      return [id, el ? { rect: rectOf(el), text: el.textContent.trim().replace(/\s+/g, " "), visible: style(el, "display") !== "none" } : null];
    }));
    const cards = [...document.querySelectorAll("#introBody .intro-block")].map((el) => ({
      text: el.textContent.trim().replace(/\s+/g, " ").slice(0, 48),
      rect: rectOf(el),
      clipped: el.scrollWidth > el.clientWidth + 1
    }));
    const overlaps = [];
    for (let i = 0; i < cards.length; i += 1) {
      for (let j = i + 1; j < cards.length; j += 1) {
        const a = cards[i].rect;
        const b = cards[j].rect;
        if (a.x < b.right - 1 && b.x < a.right - 1 && a.y < b.bottom - 1 && b.y < a.bottom - 1) overlaps.push([i, j]);
      }
    }
    const overflowing = [...document.querySelectorAll("#introPage *")].filter((el) => {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.overflowX === "auto" || s.overflowX === "scroll") return false;
      return el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0;
    }).map((el) => `${el.tagName.toLowerCase()}.${el.className || "-"}:${el.scrollWidth}/${el.clientWidth}`).slice(0, 12);
    const shell = document.querySelector(".intro-shell");
    const grid = document.getElementById("introBody").firstElementChild;
    return {
      theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
      viewport: { width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth },
      shell: { rect: rectOf(shell), padding: style(shell, "padding"), containerType: style(shell, "containerType") },
      gridColumns: style(grid, "gridTemplateColumns"),
      key,
      cards,
      overlaps,
      overflowing
    };
  });

  const name = `${label}-${theme}-${width}-${subject}`;
  await page.locator(".intro-shell").screenshot({ path: path.join(shotDir, `${name}-shell.png`) });
  await page.screenshot({ path: path.join(shotDir, `${name}-full.png`), fullPage: true });
  await context.close();
  return { name, subject, ...report };
}

const results = [];
for (const theme of themes) {
  for (const width of widths) {
    for (const subject of subjects) {
      results.push(await auditCase(theme, width, subject));
    }
  }
}

fs.writeFileSync(path.join(shotDir, `${label}-report.json`), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.map((r) => ({
  n: r.name,
  overflow: r.viewport.scrollWidth - r.viewport.width,
  columns: r.gridColumns,
  cards: r.cards.length,
  cardClip: r.cards.filter((c) => c.clipped).length,
  overlaps: r.overlaps.length,
  overflowing: r.overflowing.length
})), null, 2));
await browser.close();
server.close();
