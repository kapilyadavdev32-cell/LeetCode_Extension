import test from "node:test";
import assert from "node:assert/strict";
import MarkdownIt from "markdown-it";
import texmath from "markdown-it-texmath";
import katex from "katex";
import hljs from "highlight.js/lib/common";

const markdown = MarkdownIt({
  html: false,
  breaks: true,
  highlight(code, language) {
    if (!language || !hljs.getLanguage(language)) {
      return MarkdownIt().utils.escapeHtml(code);
    }
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  }
}).use(texmath, {
  engine: katex,
  delimiters: ["dollars", "brackets"],
  katexOptions: { throwOnError: false, trust: false }
});

test("renders common Markdown blocks and inline formatting", () => {
  const html = markdown.render([
    "# Heading",
    "",
    "A paragraph with **bold** and `inline code`.",
    "",
    "- First item",
    "- Second item",
    "",
    "1. Numbered one",
    "2. Numbered two"
  ].join("\n"));

  assert.match(html, /<h1>Heading<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<code>inline code<\/code>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<ol>/);
});

test("renders fenced code with language highlighting", () => {
  const html = markdown.render("```python\nprint('hello')\n```");
  assert.match(html, /<pre><code class="language-python hljs">/);
  assert.match(html, /class="hljs-string"/);
});

test("renders inline and display mathematical expressions", () => {
  const html = markdown.render("Inline $x^2$ and display:\n\n$$\nx^2 + y^2 = z^2\n$$");
  assert.match(html, /class="katex"/);
  assert.match(html, /katex-display/);
});

test("does not render raw HTML from an assistant response", () => {
  const html = markdown.render('<img src=x onerror="alert(1)">');
  assert.match(html, /&lt;img/);
  assert.doesNotMatch(html, /<img/);
});
