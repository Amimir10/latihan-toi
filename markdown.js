(() => {
  "use strict";

  const scope = typeof window !== "undefined" ? window : globalThis;

  function clean(value) {
    return String(value == null ? "" : value).replace(/\r\n?/g, "\n").replace(/\u0000/g, "");
  }

  function escapeHtml(value) {
    return clean(value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[ch]);
  }

  function safeUrl(value) {
    const url = String(value || "").trim();
    if (!url) return "";
    if (/^(https?:\/\/|\/|\.\/|#)/i.test(url)) return url;
    return "";
  }

  function linkHtml(label, url) {
    const href = safeUrl(url);
    if (!href) return `[${label}](${url})`;
    return `<a class="md-link" href="${escapeHtml(href)}" rel="noopener noreferrer" target="_blank">${label}</a>`;
  }

  function inlineHtml(value) {
    const parts = clean(value).split(/(`[^`\n]+`)/g);
    return parts.map((part) => {
      if (part.length > 1 && part.charAt(0) === "`" && part.charAt(part.length - 1) === "`") {
        return `<code class="md-code">${escapeHtml(part.slice(1, -1))}</code>`;
      }
      let html = escapeHtml(part);
      const stored = [];
      html = html.replace(/\[([^\]\n]+)\]\(([^\s)]+)\)/g, (_match, label, url) => {
        stored.push(linkHtml(escapeHtml(label), url));
        return `\u0000${stored.length - 1}\u0000`;
      });
      html = html.replace(/\*\*([^*]+)\*\*/g, (_match, inner) => {
        stored.push(`<strong class="md-strong">${inner}</strong>`);
        return `\u0000${stored.length - 1}\u0000`;
      });
      html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, (_match, lead, inner) => {
        stored.push(`${lead}<em class="md-em">${inner}</em>`);
        return `\u0000${stored.length - 1}\u0000`;
      });
      html = html.replace(/\u0000(\d+)\u0000/g, (_match, index) => stored[Number(index)] || "");
      return html.replace(/\n/g, "<br>");
    }).join("");
  }

  function isBlank(line) {
    return line.trim() === "";
  }

  function isFence(line) {
    return /^\s*```/.test(line);
  }

  function headingMatch(line) {
    return line.match(/^\s{0,3}(#{1,6})\s+(\S.*)$/);
  }

  function quoteMatch(line) {
    return line.match(/^\s{0,3}>\s?(\S.*)$/);
  }

  function listMatch(line) {
    const unordered = line.match(/^\s{0,3}[-*+]\s+(\S.*)$/);
    if (unordered) return { ordered: false, content: unordered[1] };
    const ordered = line.match(/^\s{0,3}\d+[.)]\s+(\S.*)$/);
    if (ordered) return { ordered: true, content: ordered[1] };
    return null;
  }

  function toHtml(value) {
    const lines = clean(value).split("\n");
    const output = [];
    let index = 0;

    while (index < lines.length) {
      const line = lines[index];
      if (isBlank(line)) {
        index += 1;
        continue;
      }

      if (isFence(line)) {
        index += 1;
        const code = [];
        while (index < lines.length && !isFence(lines[index])) {
          code.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) index += 1;
        output.push(`<pre class="md-pre"><code class="md-code-block">${escapeHtml(code.join("\n"))}</code></pre>`);
        continue;
      }

      const heading = headingMatch(line);
      if (heading) {
        const level = heading[1].length <= 2 ? "h3" : "h4";
        output.push(`<${level} class="md-heading">${inlineHtml(heading[2].trim())}</${level}>`);
        index += 1;
        continue;
      }

      if (quoteMatch(line)) {
        const quote = [];
        while (index < lines.length) {
          const match = quoteMatch(lines[index]);
          if (!match) break;
          quote.push(match[1]);
          index += 1;
        }
        output.push(`<blockquote class="md-quote">${inlineHtml(quote.join("\n"))}</blockquote>`);
        continue;
      }

      const firstItem = listMatch(line);
      if (firstItem) {
        const ordered = firstItem.ordered;
        const items = [];
        while (index < lines.length) {
          const match = listMatch(lines[index]);
          if (!match || match.ordered !== ordered) break;
          items.push(match.content);
          index += 1;
        }
        const tag = ordered ? "ol" : "ul";
        const className = ordered ? "md-list md-list-ordered" : "md-list";
        output.push(`<${tag} class="${className}">${items.map((item) => `<li>${inlineHtml(item)}</li>`).join("")}</${tag}>`);
        continue;
      }

      const paragraph = [];
      while (index < lines.length && !isBlank(lines[index]) && !isFence(lines[index]) && !headingMatch(lines[index]) && !quoteMatch(lines[index]) && !listMatch(lines[index])) {
        paragraph.push(lines[index].trim());
        index += 1;
      }
      output.push(`<p class="md-paragraph">${inlineHtml(paragraph.join("\n"))}</p>`);
    }

    return output.join("");
  }

  function renderInto(element, value, options = {}) {
    if (!element) return;
    element.innerHTML = options.inline ? inlineHtml(value) : toHtml(value);
  }

  scope.ASAS_MARKDOWN = {
    toHtml,
    toInlineHtml: inlineHtml,
    renderInto,
    escapeHtml
  };
})();
