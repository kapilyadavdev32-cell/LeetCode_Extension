function getLeetCodeContext(includeCode) {
  const title =
    document.querySelector("main h1")?.innerText?.trim() ||
    document.querySelector("h1")?.innerText?.trim() ||
    document.title.replace(/\s*-\s*LeetCode\s*$/i, "").trim();

  const descriptionSelectors = [
    '[data-track-load="description_content"]',
    ".elfjS",
    '[class*="description__"]'
  ];
  let description = "";
  for (const selector of descriptionSelectors) {
    const text = document.querySelector(selector)?.innerText?.trim() || "";
    if (text.length > description.length) description = text;
  }
  if (!description) description = document.querySelector("main")?.innerText?.trim() || "";

  const slug = location.pathname.match(/\/problems\/([^/]+)/)?.[1] || "";
  const visible = (element) => element.getClientRects().length > 0;
  let code = "";
  if (includeCode) {
    const editorRoots = [
      ...document.querySelectorAll(".monaco-editor, .cm-editor, .CodeMirror")
    ].filter(visible);
    const codeCandidates = [];
    for (const root of editorRoots) {
      const lineNodes = root.querySelectorAll(".view-line, .cm-line, .CodeMirror-line");
      const text = lineNodes.length
        ? [...lineNodes].map((line) => line.innerText || "").join("\n").trim()
        : (root.innerText || "").trim();
      if (text) codeCandidates.push(text);
    }
    code = codeCandidates.sort((a, b) => b.length - a.length)[0] || "";
  }

  const languageNames = [
    ["python3", "Python 3"],
    ["python", "Python"],
    ["javascript", "JavaScript"],
    ["typescript", "TypeScript"],
    ["c++", "C++"],
    ["java", "Java"],
    ["c#", "C#"],
    ["golang", "Go"],
    ["go", "Go"],
    ["rust", "Rust"],
    ["ruby", "Ruby"],
    ["swift", "Swift"],
    ["kotlin", "Kotlin"],
    ["c", "C"]
  ];
  let programmingLanguage = "";
  for (const control of document.querySelectorAll("select, button, [role='button']")) {
    if (!visible(control)) continue;
    const label =
      control.tagName === "SELECT"
        ? control.selectedOptions[0]?.textContent
        : control.getAttribute("aria-label") || control.innerText;
    const normalized = (label || "").trim().toLowerCase();
    const match = languageNames.find(
      ([key]) => normalized === key || normalized.startsWith(`${key} `)
    );
    if (match) {
      programmingLanguage = match[1];
      break;
    }
  }
  if (!programmingLanguage && code) {
    if (/#include\s*<|std::|vector\s*</.test(code)) programmingLanguage = "C++";
    else if (/^\s*(def |class \w+.*:)|\bself\b/m.test(code)) programmingLanguage = "Python";
    else if (/\b(const|let)\s+\w+|console\.log|=>/.test(code)) programmingLanguage = "JavaScript";
    else if (/public static void main|System\.out\.|class Solution\s*\{/.test(code)) {
      programmingLanguage = "Java";
    }
  }

  const resultPattern =
    /wrong answer|accepted|time limit exceeded|runtime error|compile error|memory limit exceeded|test result|submission|expected output/i;
  const visibleText = document.body.innerText || "";
  const submissionResults = [...new Set(
    visibleText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && resultPattern.test(line))
  )]
    .slice(-30)
    .join("\n")
    .slice(0, 4000);

  return {
    title: title || "LeetCode problem",
    description: description.slice(0, 14000),
    url: location.href,
    slug,
    programmingLanguage: programmingLanguage || "Unknown",
    code: code.slice(0, 16000),
    submissionResults
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_LEETCODE_CONTEXT") {
    sendResponse(getLeetCodeContext(message.includeCode === true));
  }
});
