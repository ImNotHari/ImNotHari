import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GITHUB_API_BASE = "https://api.github.com";
const MAX_TOPICS = 8;
const ACTIVITY_WEEKS = 52;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REDUCED_MOTION_CSS = `
  @media (prefers-reduced-motion: reduce) {
    .line-fetch, .line-success, .line-card, .line-bottom { opacity: 1 !important; animation: none !important; }
    .typing-cursor { opacity: 0 !important; animation: none !important; }
    .cursor { visibility: visible !important; animation: none !important; }
    clipPath rect { width: 9999px !important; }
  }
`;

const WINDOWS_THEME = {
  frameBg: "#151b23",
  bodyBg: "#0d1117",
  headerBg: "#151b23",
  text: "#e6edf3",
  title: () => `Windows PowerShell`,
  controlsSvg: (x, y) => `
    <line x1="${x}" y1="${y}" x2="${x + 10}" y2="${y}" stroke="#8b949e" stroke-width="1.3"/>
    <rect x="${x + 22}" y="${y - 5}" width="10" height="10" fill="none" stroke="#8b949e" stroke-width="1.3"/>
    <line x1="${x + 44}" y1="${y - 5}" x2="${x + 54}" y2="${y + 5}" stroke="#8b949e" stroke-width="1.3"/>
    <line x1="${x + 54}" y1="${y - 5}" x2="${x + 44}" y2="${y + 5}" stroke="#8b949e" stroke-width="1.3"/>
  `,
  palette: {
    fg: "#e6edf3",
    mute: "#8b949e",
    border: "rgba(255,255,255,0.08)",
    accent: "#58a6ff",
    green: "#3fb950",
    blue: "#58a6ff",
    cyan: "#39d2c0",
    yellow: "#d29922",
    purple: "#bc8cff",
    orange: "#d29922",
    graph: ["#161b22", "#0e4429", "#006d32", "#39d353"],
  },
};

const LANGUAGE_COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  "Jupyter Notebook": "#DA5B0B",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  Go: "#00ADD8",
  Rust: "#dea584",
  Ruby: "#701516",
  PHP: "#4F5D95",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Shell: "#89e051",
  Vue: "#41b883",
  Kotlin: "#A97BFF",
  Swift: "#F05138",
  Dart: "#00B4AB",
};

function escapeXml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readableColor(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ""));
  if (!match) return hex;
  const value = Number.parseInt(match[1], 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const luminance = (0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]) / 255;
  if (luminance >= 0.5) return hex;
  const mix = Math.min(0.6, (0.5 - luminance) * 2);
  return `#${channels.map((c) => Math.round(c + (255 - c) * mix).toString(16).padStart(2, "0")).join("")}`;
}

function truncateFit(text, maxChars) {
  const t = String(text);
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(1, maxChars - 1))}…`;
}

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString("en-US");
}

function textWidth(text, fontSize = 16) {
  return text.length * (fontSize * 0.62);
}

function promptPartsWidth(parts, fontSize = 16) {
  const promptCharFactor = 0.56;
  return parts.reduce((acc, part) => acc + part.text.length * (fontSize * promptCharFactor), 0);
}

function addTextSpans(parts, startX, y, fontSize = 16) {
  const spans = parts.map((part) => `<tspan fill="${part.fill}">${escapeXml(part.text)}</tspan>`);
  return `<text x="${startX}" y="${y}" font-size="${fontSize}" font-family="'Source Code Pro', Consolas, Menlo, monospace" xml:space="preserve" textLength="${promptPartsWidth(parts, fontSize)}" lengthAdjust="spacingAndGlyphs">${spans.join("")}</text>`;
}

function resolveOutputScale(input) {
  const parsed = Number.parseFloat(String(input ?? "1"));
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(3, Math.max(0.05, parsed));
}

function resolveRepoTarget(githubId, repoInput) {
  const raw = String(repoInput ?? "").trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\/+$/, "");
  if (!raw) {
    throw new Error("Repo target is required (e.g. owner/name).");
  }
  const [first, second] = raw.split("/");
  const owner = second ? first : String(githubId ?? "").trim();
  const name = second ?? first;
  return { owner, name };
}

async function fetchGithub(url) {
  const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "github-readme-repo-terminal",
  };
  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
  }
  return fetch(url, { headers });
}

async function fetchJson(url, notFoundMessage) {
  const response = await fetchGithub(url);
  if (response.status === 404) {
    if (notFoundMessage === null) return null;
    throw new Error(notFoundMessage);
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub API: HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchCommitActivity(base) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetchGithub(`${base}/stats/commit_activity`);
    if (response.status === 200) {
      const data = await response.json();
      return Array.isArray(data) ? data.slice(-ACTIVITY_WEEKS).map((week) => Number(week.total ?? 0)) : null;
    }
    if (response.status !== 202) return null;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return null;
}

async function fetchRepoData(owner, name) {
  const base = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const repo = await fetchJson(base, `GitHub repository ${owner}/${name} not found.`);
  const [languages, release, activity] = await Promise.all([
    fetchJson(`${base}/languages`, null).catch(() => null),
    fetchJson(`${base}/releases/latest`, null).catch(() => null),
    fetchCommitActivity(base).catch(() => null),
  ]);
  return { repo, languages: languages ?? {}, release, activity };
}

function formatRelativeTime(isoDate, now = Date.now()) {
  if (!isoDate) return "";
  const diffSec = Math.max(0, Math.floor((now - new Date(isoDate).getTime()) / 1000));
  if (diffSec < 60) return "just now";
  const minutes = Math.floor(diffSec / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function formatCompact(value) {
  const n = Number(value ?? 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return formatNumber(n);
}

function buildWindowsPrompt(user) {
  const palette = WINDOWS_THEME.palette;
  return [
    { text: "PS ", fill: palette.purple },
    { text: `C:\\Users\\${user}`, fill: palette.yellow },
    { text: "> ", fill: palette.fg },
  ];
}

function createAnimationCss(timeline) {
  const pct = (seconds) => ((seconds / timeline.cycleDuration) * 100).toFixed(4);

  return `
  .line-fetch { opacity: 0; animation: show-fetch ${timeline.cycleDuration}s linear forwards; }
  .line-success { opacity: 0; animation: show-success ${timeline.cycleDuration}s linear forwards; }
  .line-card { opacity: 0; animation: show-card ${timeline.cycleDuration}s linear forwards; }
  .line-bottom { opacity: 0; animation: show-bottom ${timeline.cycleDuration}s linear forwards; }
  .cursor {
    opacity: 1;
    visibility: hidden;
    animation: cursor-window ${timeline.cycleDuration}s steps(1, end) forwards, blink ${timeline.blinkDuration}s steps(1,end) infinite;
  }
  .typing-cursor {
    opacity: 1;
    animation: typing-cursor-window ${timeline.cycleDuration}s steps(1, end) forwards;
  }
  @keyframes show-fetch { 0%, ${pct(Math.max(0, timeline.fetchStart - 0.01))}% { opacity: 0; } ${pct(timeline.fetchStart)}%, 100% { opacity: 1; } }
  @keyframes show-success { 0%, ${pct(Math.max(0, timeline.successAt - 0.01))}% { opacity: 0; } ${pct(timeline.successAt)}%, 100% { opacity: 1; } }
  @keyframes show-card { 0%, ${pct(Math.max(0, timeline.cardAt - 0.01))}% { opacity: 0; } ${pct(timeline.cardAt)}%, 100% { opacity: 1; } }
  @keyframes show-bottom { 0%, ${pct(Math.max(0, timeline.bottomAt - 0.01))}% { opacity: 0; } ${pct(timeline.bottomAt)}%, 100% { opacity: 1; } }
  @keyframes cursor-window { 0%, ${pct(Math.max(0, timeline.bottomAt - 0.01))}% { visibility: hidden; } ${pct(timeline.bottomAt)}%, 100% { visibility: visible; } }
  @keyframes typing-cursor-window { 0%, ${pct(timeline.typingDuration)}% { opacity: 1; } ${pct(Math.min(timeline.cycleDuration, timeline.typingDuration + 0.01))}%, 100% { opacity: 0; } }
  @keyframes blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
  `;
}

export async function generateRepoCardSvg(githubId, repoInput, options = {}) {
  const theme = WINDOWS_THEME;
  const palette = theme.palette;

  const { owner, name } = resolveRepoTarget(githubId, repoInput);
  const { repo, languages, release, activity } = await fetchRepoData(owner, name);
  const now = Date.now();
  const user = String(githubId ?? "").trim() || repo.owner?.login || owner;
  const fullName = repo.full_name ?? `${owner}/${name}`;
  const [ownerLabel, repoNameLabel] = fullName.split("/");

  const termX = 12;
  const termY = 12;
  const headerH = 38;
  const promptY = 78;
  const cardX = 32;
  const cardY = 142;
  const fetchLineY = promptY + 22;
  const successLineY = fetchLineY + 20;

  const commandText = `gh repo view ${fullName}`;
  const width = 940;
  const termW = width - termX * 2;
  const cardW = width - cardX * 2;
  const x0 = cardX + 24;
  const contentRight = cardX + cardW - 24;
  const contentW = contentRight - x0;

  const topics = (Array.isArray(repo.topics) ? repo.topics : []).slice(0, MAX_TOPICS);
  const nameY = cardY + 36;
  const descY = nameY + 28;
  const metaY = descY + 34;
  const metaRowH = 22;
  const topicsY = metaY + metaRowH + 32;
  const activityLabelY = topics.length > 0 ? topicsY + 36 : topicsY;
  const activityBaseY = activityLabelY + 38;
  const cardH = activityBaseY - cardY + 22;
  const bottomPromptY = cardY + cardH + 28;
  const termBottomPadding = 22;
  const termBodyTop = termY + headerH;
  const termH = bottomPromptY + termBottomPadding - termY;
  const height = termY + termH + 12;
  const outputScale = resolveOutputScale(options.scale);
  const outputWidth = Math.round(width * outputScale);
  const outputHeight = Math.round(height * outputScale);

  const borderColor = palette.border;
  const labelColor = palette.mute;

  const languageTotal = Object.values(languages).reduce((acc, size) => acc + Number(size), 0);
  const primaryLanguage = repo.language ?? Object.keys(languages)[0] ?? null;
  const primaryPct = primaryLanguage && languageTotal > 0
    ? `${((Number(languages[primaryLanguage] ?? 0) / languageTotal) * 100).toFixed(1).replace(/\.0$/, "")}%`
    : "";
  const meta = [
    ["language", primaryLanguage ? `${primaryLanguage} ${primaryPct}`.trim() : "—", primaryLanguage ? theme.text : labelColor, primaryLanguage ? readableColor(LANGUAGE_COLORS[primaryLanguage] ?? palette.mute) : null],
    ["license", repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION" ? repo.license.spdx_id : (repo.license?.name ?? "none"), theme.text],
    ["branch", repo.default_branch ?? "main", palette.cyan],
    ["release", release?.tag_name ? `${release.tag_name} · ${formatRelativeTime(release.published_at, now)}` : "none", release?.tag_name ? palette.green : labelColor],
    ["pushed", formatRelativeTime(repo.pushed_at, now) || "—", theme.text],
    ["open", `${formatNumber(repo.open_issues_count)} issues/PRs`, theme.text],
  ];

  const promptParts = buildWindowsPrompt(user);
  const promptStartX = 32;
  const commandX = promptStartX + promptPartsWidth(promptParts, 15) + 3;
  const commandWidth = textWidth(commandText, 15);
  const commandClipId = "repo-command-typing-clip";
  const fetchClipId = "repo-fetch-typing-clip";
  const fetchText = `Fetching repository ${fullName}...`;
  const fetchWidth = textWidth(fetchText, 13);
  const flags = [repo.archived ? "archived" : null, repo.fork ? "fork" : null].filter(Boolean);

  const timeline = {
    typingDuration: 1.0,
    fetchStart: 1.0,
    fetchDuration: 0.6,
    successAt: 1.65,
    cardAt: 1.8,
    blinkDuration: 0.8,
  };
  timeline.bottomAt = timeline.cardAt + 0.3;
  timeline.cycleDuration = timeline.bottomAt;
  timeline.typingRatio = (timeline.typingDuration / timeline.cycleDuration).toFixed(6);
  timeline.fetchStartRatio = (timeline.fetchStart / timeline.cycleDuration).toFixed(6);
  timeline.fetchEndRatio = ((timeline.fetchStart + timeline.fetchDuration) / timeline.cycleDuration).toFixed(6);

  const controlsY = termY + 19;
  const controlsX = termX + termW - 74;

  const svg = [];
  svg.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${width} ${height}" role="img" aria-label="GitHub repository card for ${escapeXml(fullName)}">`);
  svg.push(`<title>${escapeXml(theme.title())}</title>`);
  svg.push(`<defs>`);
  svg.push(`<style>${createAnimationCss(timeline)}${REDUCED_MOTION_CSS}</style>`);
  svg.push(`<clipPath id="${commandClipId}"><rect x="${commandX}" y="${promptY - 16}" width="0" height="22"><animate attributeName="width" values="0;${commandWidth + 6};${commandWidth + 6}" keyTimes="0;${timeline.typingRatio};1" dur="${timeline.cycleDuration}s" fill="freeze" /></rect></clipPath>`);
  svg.push(`<clipPath id="${fetchClipId}"><rect x="${promptStartX}" y="${fetchLineY - 16}" width="0" height="20"><animate attributeName="width" values="0;0;${fetchWidth + 6};${fetchWidth + 6}" keyTimes="0;${timeline.fetchStartRatio};${timeline.fetchEndRatio};1" dur="${timeline.cycleDuration}s" fill="freeze" /></rect></clipPath>`);
  svg.push(`</defs>`);

  // Outer Windows PowerShell Frame
  svg.push(`<rect x="${termX}" y="${termY}" width="${termW}" height="${termH}" rx="12" fill="${theme.frameBg}" stroke="${borderColor}" stroke-width="1"/>`);
  svg.push(`<rect x="${termX + 1}" y="${termBodyTop}" width="${termW - 2}" height="${termH - headerH - 12}" rx="0" fill="${theme.bodyBg}"/>`);
  svg.push(`<rect x="${termX + 1}" y="${termY + 1}" width="${termW - 2}" height="${headerH}" rx="11" fill="${theme.headerBg}"/>`);
  svg.push(`<line x1="${termX}" y1="${termBodyTop}" x2="${termX + termW}" y2="${termBodyTop}" stroke="${borderColor}" stroke-width="1"/>`);
  // PowerShell badge icon
  svg.push(`<rect x="${termX + 14}" y="${termY + 10}" width="20" height="18" rx="3" fill="#2563eb"/>`);
  svg.push(`<text x="${termX + 24}" y="${termY + 23}" font-size="10" font-weight="700" font-family="'Source Code Pro', Consolas, monospace" fill="#ffffff" text-anchor="middle">&gt;_</text>`);
  svg.push(theme.controlsSvg(controlsX, controlsY));
  svg.push(`<text x="${termX + termW / 2}" y="${termY + 24}" font-size="13" font-family="'Source Code Pro', Consolas, Menlo, monospace" fill="#8b949e" text-anchor="middle">${escapeXml(theme.title())}</text>`);

  // Prompt + Command
  svg.push(addTextSpans(promptParts, promptStartX, promptY, 15));
  svg.push(`<text x="${commandX}" y="${promptY}" fill="${theme.text}" font-size="15" font-family="'Source Code Pro', Consolas, Menlo, monospace" clip-path="url(#${commandClipId})">${escapeXml(commandText)}</text>`);
  svg.push(`<text class="typing-cursor" x="${commandX}" y="${promptY}" fill="${palette.fg}" font-size="15" font-family="'Source Code Pro', Consolas, Menlo, monospace">█<animate attributeName="x" values="${commandX};${commandX + commandWidth + 2};${commandX + commandWidth + 2}" keyTimes="0;${timeline.typingRatio};1" dur="${timeline.cycleDuration}s" fill="freeze" /></text>`);

  svg.push(`<g class="line-fetch">`);
  svg.push(`<text x="${promptStartX}" y="${fetchLineY}" fill="${palette.mute}" font-size="13" font-family="'Source Code Pro', Consolas, Menlo, monospace" clip-path="url(#${fetchClipId})">${escapeXml(fetchText)}</text>`);
  svg.push(`</g>`);

  svg.push(`<g class="line-success">`);
  svg.push(`<text x="${promptStartX}" y="${successLineY}" font-size="13" font-family="'Source Code Pro', Consolas, Menlo, monospace"><tspan fill="${palette.green}">\u2714 </tspan><tspan fill="${theme.text}">${escapeXml(`Success! Loaded repository '${fullName}'.`)}</tspan></text>`);
  svg.push(`</g>`);

  // Inner Repo Card
  svg.push(`<g class="line-card">`);
  svg.push(`<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${cardH}" rx="12" fill="#151b23" stroke="${borderColor}" stroke-width="1"/>`);

  const counters = `<tspan fill="${palette.yellow}">★ </tspan><tspan fill="${theme.text}">${formatCompact(repo.stargazers_count)}</tspan>`
    + `<tspan fill="${labelColor}">   forks </tspan><tspan fill="${theme.text}">${formatCompact(repo.forks_count)}</tspan>`
    + `<tspan fill="${labelColor}">   watch </tspan><tspan fill="${theme.text}">${formatCompact(repo.subscribers_count ?? repo.watchers_count)}</tspan>`;
  const countersChars = 2 + formatCompact(repo.stargazers_count).length + 9 + formatCompact(repo.forks_count).length + 9 + formatCompact(repo.subscribers_count ?? repo.watchers_count).length;
  const nameMaxChars = Math.max(8, Math.floor((contentW - countersChars * 14 * 0.6 - 24) / (20 * 0.6)) - flags.join(" ").length);
  const nameText = truncateFit(fullName, nameMaxChars);
  const ownerPart = nameText.startsWith(`${ownerLabel}/`) ? `${ownerLabel}/` : "";
  const namePart = ownerPart ? nameText.slice(ownerPart.length) : nameText;
  const flagSpans = flags.map((flag) => `<tspan fill="${palette.orange}" font-size="13" font-weight="400">  [${flag}]</tspan>`).join("");
  svg.push(`<text x="${x0}" y="${nameY}" font-size="20" font-weight="700" font-family="'Source Code Pro', Consolas, Menlo, monospace"><tspan fill="${labelColor}">${escapeXml(ownerPart)}</tspan><tspan fill="${palette.accent}">${escapeXml(namePart || repoNameLabel)}</tspan>${flagSpans}</text>`);
  svg.push(`<text x="${contentRight}" y="${nameY - 1}" font-size="14" font-family="'Source Code Pro', Consolas, Menlo, monospace" text-anchor="end">${counters}</text>`);

  const description = String(repo.description ?? "").replace(/\s+/g, " ").trim();
  const descMaxChars = Math.floor(contentW / (14 * 0.52));
  svg.push(`<text x="${x0}" y="${descY}" font-size="14" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif" fill="${description ? theme.text : labelColor}">${escapeXml(description ? truncateFit(description, descMaxChars) : "No description provided.")}</text>`);

  const colW = Math.floor(contentW / 3);
  meta.forEach(([key, value, color, dotColor], i) => {
    const x = x0 + (i % 3) * colW;
    const y = metaY + Math.floor(i / 3) * metaRowH;
    const maxChars = Math.floor((colW - 90) / (13 * 0.6)) - (dotColor ? 2 : 0);
    const valueSpans = dotColor
      ? `<tspan x="${x + 80}" fill="${dotColor}">● </tspan><tspan fill="${color}">${escapeXml(truncateFit(value, maxChars))}</tspan>`
      : `<tspan x="${x + 80}" fill="${color}">${escapeXml(truncateFit(value, maxChars))}</tspan>`;
    svg.push(`<text x="${x}" y="${y}" font-size="13" font-family="'Source Code Pro', Consolas, Menlo, monospace"><tspan fill="${labelColor}">${key}:</tspan>${valueSpans}</text>`);
  });

  let topicX = x0;
  for (const topic of topics) {
    const label = `#${topic}`;
    const pillW = label.length * 12 * 0.6 + 18;
    if (topicX + pillW > contentRight) break;
    svg.push(`<rect x="${topicX}" y="${topicsY - 14}" width="${pillW}" height="20" rx="10" fill="none" stroke="${borderColor}"/>`);
    svg.push(`<text x="${topicX + 9}" y="${topicsY}" font-size="12" font-family="'Source Code Pro', Consolas, Menlo, monospace" fill="${palette.blue}">${escapeXml(label)}</text>`);
    topicX += pillW + 8;
  }

  if (activity && activity.length > 0) {
    const totalCommits = activity.reduce((acc, value) => acc + value, 0);
    svg.push(`<text x="${x0}" y="${activityLabelY}" font-size="12" font-family="'Source Code Pro', Consolas, Menlo, monospace" fill="${labelColor}">commit activity · last ${activity.length} weeks · ${formatNumber(totalCommits)} commits</text>`);
    const maxWeek = Math.max(1, ...activity);
    const slot = contentW / ACTIVITY_WEEKS;
    const barW = Math.max(2, slot * 0.84);
    activity.forEach((value, i) => {
      const barH = value === 0 ? 2 : Math.max(4, Math.round(Math.sqrt(value / maxWeek) * 26));
      const level = value === 0 ? 0 : Math.min(3, Math.ceil((value / maxWeek) * 3));
      const x = x0 + (ACTIVITY_WEEKS - activity.length + i) * slot;
      svg.push(`<rect x="${x.toFixed(1)}" y="${activityBaseY - barH}" width="${barW.toFixed(1)}" height="${barH}" rx="1.5" fill="${palette.graph[level]}"/>`);
    });
  } else {
    svg.push(`<text x="${x0}" y="${activityLabelY}" font-size="12" font-family="'Source Code Pro', Consolas, Menlo, monospace" fill="${labelColor}">commit activity · not available yet (GitHub is still computing stats)</text>`);
    svg.push(`<line x1="${x0}" y1="${activityBaseY - 1}" x2="${contentRight}" y2="${activityBaseY - 1}" stroke="${palette.graph[0]}" stroke-width="2" stroke-dasharray="11,4"/>`);
  }
  svg.push(`</g>`);

  svg.push(`<g class="line-bottom">`);
  svg.push(addTextSpans(promptParts, promptStartX, bottomPromptY, 15));
  svg.push(`<text class="cursor" x="${promptStartX + promptPartsWidth(promptParts, 15)}" y="${bottomPromptY}" fill="${palette.fg}" font-size="15" font-family="'Source Code Pro', Consolas, Menlo, monospace">█</text>`);
  svg.push(`</g>`);

  svg.push(`</svg>`);
  return svg.join("\n");
}

const DEFAULT_REPOS = [
  { repo: "ImNotHari/Earthsense", out: "assets/repo-earthsense.svg" },
  { repo: "ImNotHari/gomosy", out: "assets/repo-gomosy.svg" },
  { repo: "ImNotHari/TRACE", out: "assets/repo-trace.svg" },
  { repo: "ImNotHari/expensetracker", out: "assets/repo-expensetracker.svg" },
];

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  const githubId = process.env.GITHUB_USERNAME || process.argv[2] || "ImNotHari";
  const rootDir = path.resolve(__dirname, "..");

  for (const item of DEFAULT_REPOS) {
    const outPath = path.resolve(rootDir, item.out);
    const svgContent = await generateRepoCardSvg(githubId, item.repo);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, svgContent, "utf8");
    console.log(`Generated ${item.out} for ${item.repo} (windows)`);
  }
}
