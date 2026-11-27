import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const playwrightUrl = pathToFileURL("C:\\Users\\ThinkPad\\AppData\\Local\\Temp\\opencode\\pw\\node_modules\\playwright\\index.mjs").href;
const { chromium } = await import(playwrightUrl);

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const shotDir = path.join(root, "screenshots", "mindmap");
fs.mkdirSync(shotDir, { recursive: true });

const args = process.argv.slice(2);
const label = args.includes("--label") ? args[args.indexOf("--label") + 1] : "audit";
const subjectsArg = args.includes("--subjects") ? args[args.indexOf("--subjects") + 1] : "pendidikan-pancasila";
const widthsArg = args.includes("--widths") ? args[args.indexOf("--widths") + 1] : "1440";
const themesArg = args.includes("--themes") ? args[args.indexOf("--themes") + 1] : "light,dark";
const synthetic = args.includes("--synthetic");
const subjects = subjectsArg.split(",").filter(Boolean);
const widths = widthsArg.split(",").map(Number).filter(Boolean);
const themes = themesArg.split(",").filter(Boolean);
const port = 4173;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml"
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
const cases = synthetic
  ? [
      { id: "pendidikan-pancasila", synthetic: "s12" },
      { id: "pendidikan-pancasila", synthetic: "depth4" },
      { id: "pendidikan-pancasila", synthetic: "long" },
      { id: "pendidikan-pancasila", synthetic: "unbroken" },
      { id: "pendidikan-pancasila", synthetic: "single" },
      { id: "pendidikan-pancasila", synthetic: "empty" }
    ]
  : subjects.map((id) => ({ id, synthetic: "" }));

function syntheticContent(kind) {
  const leaf = (judul) => ({ judul });
  if (kind === "s12") return { mindMap: { pusat: "Uji 12 Anak", cabang: [{ judul: "Cabang 12 anak", anak: Array.from({ length: 12 }, (_, i) => leaf(`Sub-topik ${String(i + 1).padStart(2, "0")}`)) }] } };
  if (kind === "depth4") return { mindMap: { pusat: "Uji Kedalaman", cabang: [{ judul: "Level 0", anak: [{ judul: "Level 1", anak: [{ judul: "Level 2", anak: [{ judul: "Level 3", anak: [leaf("Level 4")] }] }] }] }] } };
  if (kind === "long") return { mindMap: { pusat: "Uji Judul Panjang", cabang: [{ judul: "Cabang dengan judul sangat panjang yang sengaja dibuat sampai seratus dua puluh karakter untuk menguji wrap kata dan tinggi kartu secara wajar", anak: [leaf("Anak dengan judul panjang yang juga sengaja dibuat lebih dari seratus dua puluh karakter agar pembungkusan kata tetap rapi dan tidak memecah per huruf")] }] } };
  if (kind === "unbroken") return { mindMap: { pusat: "Uji Kata Panjang", cabang: [{ judul: "PanggilKataSangatPanjangTanpaSpasiYangSengajaDibuatLimaPuluhKarakter", anak: [leaf("TurunanPanjangTanpaSpasiJugaDibuatUntukMengujiBatasWrapKata")] }] } };
  if (kind === "single") return { mindMap: { pusat: "Uji Satu Cabang", cabang: [{ judul: "Cabang tanpa anak" }] } };
  return { mindMap: { pusat: "Uji Kosong", cabang: [] } };
}

async function auditCase(testCase, theme, width) {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  await page.addInitScript(({ theme, key, contentKey, syntheticContent }) => {
    localStorage.setItem(key, JSON.stringify({ theme }));
    if (syntheticContent) localStorage.setItem(contentKey, JSON.stringify(syntheticContent));
  }, {
    theme,
    key: "asas-gasal-jawa-xi-v1",
    contentKey: `asas-gasal-jawa-xi-v1:materi:${testCase.id}`,
    syntheticContent: testCase.synthetic ? syntheticContent(testCase.synthetic) : null
  });
  const url = `http://127.0.0.1:${port}/#/ruang/${testCase.id}/belajar`;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      break;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
  await page.waitForSelector('[data-study-section="peta"]', { state: "visible" });
  await page.click('[data-study-section="peta"]');
  await page.waitForSelector(".mind-tree", { state: "visible" });
  await page.waitForTimeout(250);

  const report = await page.evaluate(() => {
    const pick = (el, props) => {
      const style = getComputedStyle(el);
      return Object.fromEntries(props.map((prop) => [prop, style[prop]]));
    };
    const rectOf = (el) => {
      const r = el.getBoundingClientRect();
      return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), width: +r.width.toFixed(1), height: +r.height.toFixed(1) };
    };
    const scroller = document.querySelector(".mind-map-scroll");
    const rows = [...document.querySelectorAll(".mind-node-row")];
    const nodes = [...document.querySelectorAll(".mind-center, .mind-node")];
    const sr = scroller.getBoundingClientRect();
    const scroll = {
      clientWidth: scroller.clientWidth,
      clientHeight: scroller.clientHeight,
      scrollWidth: scroller.scrollWidth,
      scrollHeight: scroller.scrollHeight,
      scrollLeft: scroller.scrollLeft,
      scrollTop: scroller.scrollTop,
      computed: pick(scroller, ["overflowX", "overflowY", "padding", "maxHeight", "height", "maskImage"])
    };
    const rects = nodes.map((el) => ({
      selector: el.matches(".mind-center") ? ".mind-center" : `.mind-node[data-depth="${el.dataset.depth}"]`,
      text: (el.innerText || "").replace(/\s+/g, " ").slice(0, 70),
      rect: rectOf(el),
      ratio: +(el.getBoundingClientRect().height / Math.max(1, el.getBoundingClientRect().width)).toFixed(2)
    }));
    const rowRects = rows.map((el) => {
      const rect = rectOf(el);
      return { text: (el.innerText || "").replace(/\s+/g, " ").slice(0, 70), rect, ratio: +(rect.height / Math.max(1, rect.width)).toFixed(2) };
    });
    const narrow = rowRects.filter((item) => item.rect.width < 140);
    const tall = rowRects.filter((item) => item.ratio > 2);
    const overlaps = [];
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const a = rows[i].getBoundingClientRect();
        const b = rows[j].getBoundingClientRect();
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w > 4 && h > 4) overlaps.push({ a: rows[i].innerText.slice(0, 40), b: rows[j].innerText.slice(0, 40), area: Math.round(w * h) });
      }
    }
    const overflowing = [...document.querySelectorAll(".mind-map *")].flatMap((el) => {
      const rect = el.getBoundingClientRect();
      const right = +(rect.right - sr.left).toFixed(1);
      const overRight = right > scroller.clientWidth + 1;
      const overSelf = el.scrollWidth > el.clientWidth + 1;
      return overRight || overSelf
        ? [{ selector: `${el.tagName.toLowerCase()}.${(typeof el.className === "string" ? el.className : "").split(" ").filter(Boolean).join(".")}`, text: (el.innerText || "").replace(/\s+/g, " ").slice(0, 40), right, width: +rect.width.toFixed(1), scroll: `${el.scrollWidth}/${el.clientWidth}` }]
        : [];
    });
    const clipped = rows.map((el) => {
      const r = el.getBoundingClientRect();
      const x = r.left - sr.left + scroller.scrollLeft;
      const y = r.top - sr.top + scroller.scrollTop;
      return x < 0 || y < 0 || x + r.width > scroller.scrollWidth || y + r.height > scroller.scrollHeight
        ? { text: el.innerText.replace(/\s+/g, " ").slice(0, 50), x: +x.toFixed(1), y: +y.toFixed(1), right: +(x + r.width).toFixed(1), bottom: +(y + r.height).toFixed(1) }
        : null;
    }).filter(Boolean);
    const firstRow = rows[0];
    const firstChild = document.querySelector(".mind-children .mind-node-row") || rows[1] || firstRow;
    const toggle = document.querySelector(".mind-node-toggle");
    const count = document.querySelector(".mind-node-count");
    const ancestors = [];
    for (let el = scroller; el && el !== document.documentElement; el = el.parentElement) {
      ancestors.push({
        tag: el.tagName.toLowerCase(),
        id: el.id,
        className: typeof el.className === "string" ? el.className.slice(0, 80) : "",
        ...pick(el, ["display", "height", "maxHeight", "minHeight", "overflowY", "flex", "alignItems"])
      });
    }
    return {
      theme: document.documentElement.classList.contains("dark") ? "dark" : "light",
      counts: { centers: document.querySelectorAll(".mind-center").length, nodes: document.querySelectorAll(".mind-node").length, rows: rows.length, toggles: document.querySelectorAll(".mind-node-toggle").length },
      ancestors,
      scroll,
      rects,
      narrow,
      tall,
      overlaps,
      overflowing,
      clipped,
      styles: {
        scroller: pick(scroller, ["overflowX", "overflowY", "padding", "maxHeight"]),
        tree: pick(document.querySelector(".mind-tree"), ["display", "width", "minWidth", "alignItems", "padding"]),
        center: pick(document.querySelector(".mind-center"), ["width", "minWidth", "maxWidth", "flexShrink", "borderRadius", "overflowWrap", "wordBreak"]),
        children: pick(document.querySelector(".mind-children") || document.querySelector(".mind-root"), ["position", "display", "flexDirection", "paddingLeft", "flexShrink"]),
        row: pick(firstRow, ["width", "minWidth", "maxWidth", "flex", "flexShrink", "borderRadius", "minHeight", "overflowWrap", "wordBreak"]),
        childRow: pick(firstChild, ["width", "minWidth", "maxWidth", "flex", "flexShrink", "borderRadius", "minHeight", "overflowWrap", "wordBreak"]),
        title: pick(document.querySelector(".mind-node-title"), ["width", "minWidth", "flex", "overflowWrap", "wordBreak", "hyphens"]),
        toggle: toggle ? { ...pick(toggle, ["width", "height", "color", "borderRadius", "backgroundColor", "isolation", "zIndex"]), text: toggle.textContent.trim(), before: { backgroundColor: getComputedStyle(toggle, "::before").backgroundColor, zIndex: getComputedStyle(toggle, "::before").zIndex } } : null,
        count: count ? { text: count.textContent.trim(), ...pick(count, ["minWidth", "borderRadius", "fontSize"]) } : null
      }
    };
  });

  const name = `${label}-${testCase.id}${testCase.synthetic ? "-" + testCase.synthetic : ""}-${theme}-${width}`;
  await page.locator(".mind-map").screenshot({ path: path.join(shotDir, `${name}-map.png`) });
  await page.screenshot({ path: path.join(shotDir, `${name}-viewport.png`), fullPage: false });
  await context.close();
  return { name, ...report };
}

const results = [];
for (const testCase of cases) {
  for (const theme of themes) {
    for (const width of widths) {
      results.push(await auditCase(testCase, theme, width));
    }
  }
}

fs.writeFileSync(path.join(shotDir, `${label}-report.json`), JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.map((r) => ({
  name: r.name,
  rows: r.counts.rows,
  narrow: r.narrow.length,
  tall: r.tall.length,
  overlaps: r.overlaps.length,
  clipped: r.clipped.length,
  scroll: `${r.scroll.scrollWidth}x${r.scroll.scrollHeight}/${r.scroll.clientWidth}x${r.scroll.clientHeight}`,
  toggle: r.styles.toggle?.text,
  count: r.styles.count?.text,
  rowWidth: r.styles.row.width,
  childWidth: r.styles.childRow.width,
  wrap: `${r.styles.title.overflowWrap}/${r.styles.title.wordBreak}`,
  childPosition: r.styles.children.position
})), null, 2));
await browser.close();
server.close();
