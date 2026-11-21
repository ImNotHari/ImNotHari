import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";
const ASCII_ACCENT = "░▒▓█▓▒░";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REDUCED_MOTION_CSS = `
  @media (prefers-reduced-motion: reduce) {
    .line-fetch, .line-success, .line-streak, .line-bottom { opacity: 1 !important; animation: none !important; }
    .typing-cursor { opacity: 0 !important; animation: none !important; }
    .cursor { visibility: visible !important; animation: none !important; }
    clipPath rect { width: 9999px !important; }
  }
`;

const THEMES = {
  mac: {
    frameBg: "#151b23",
    bodyBg: "#0d1117",
    headerBg: "#151b23",
    text: "#e6edf3",
    title: (id) => `${id} — zsh — 80×24`,
    controlsSvg: (x, y) => `
      <circle cx="${x}" cy="${y}" r="5.5" fill="#ff5f56"/>
      <circle cx="${x + 18}" cy="${y}" r="5.5" fill="#ffbd2e"/>
      <circle cx="${x + 36}" cy="${y}" r="5.5" fill="#27c93f"/>
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
      orange: "#58a6ff",
    },
  },
  windows: {
    frameBg: "#151b23",
    bodyBg: "#0d1117",
    headerBg: "#151b23",
    text: "#e6edf3",
    title: () => `PowerShell 7`,
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
      orange: "#58a6ff",
    },
  },
  ubuntu: {
    frameBg: "#151b23",
    bodyBg: "#0d1117",
    headerBg: "#151b23",
    text: "#e6edf3",
    title: (id) => `${id}@ubuntu: ~`,
    controlsSvg: (x, y) => `
      <circle cx="${x}" cy="${y}" r="5.5" fill="#e95420"/>
      <circle cx="${x + 18}" cy="${y}" r="5.5" fill="#77216f"/>
      <circle cx="${x + 36}" cy="${y}" r="5.5" fill="#8b949e"/>
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
      orange: "#58a6ff",
    },
  },
};

function escapeXml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

function createAnimationCss(timeline) {
  const pct = (seconds) => ((seconds / timeline.cycleDuration) * 100).toFixed(4);

  return `
  .line-fetch { opacity: 0; animation: show-fetch ${timeline.cycleDuration}s linear forwards; }
  .line-success { opacity: 0; animation: show-success ${timeline.cycleDuration}s linear forwards; }
  .line-streak { opacity: 0; animation: show-streak ${timeline.cycleDuration}s linear forwards; }
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
  @keyframes show-streak { 0%, ${pct(Math.max(0, timeline.streakAt - 0.01))}% { opacity: 0; } ${pct(timeline.streakAt)}%, 100% { opacity: 1; } }
  @keyframes show-bottom { 0%, ${pct(Math.max(0, timeline.bottomAt - 0.01))}% { opacity: 0; } ${pct(timeline.bottomAt)}%, 100% { opacity: 1; } }
  @keyframes cursor-window { 0%, ${pct(Math.max(0, timeline.bottomAt - 0.01))}% { visibility: hidden; } ${pct(timeline.bottomAt)}%, 100% { visibility: visible; } }
  @keyframes typing-cursor-window { 0%, ${pct(timeline.typingDuration)}% { opacity: 1; } ${pct(Math.min(timeline.cycleDuration, timeline.typingDuration + 0.01))}%, 100% { opacity: 0; } }
  @keyframes blink { 0%,49% { opacity: 1; } 50%,100% { opacity: 0; } }
  `;
}

function resolveOutputScale(input) {
  const parsed = Number.parseFloat(String(input ?? "1"));
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(3, Math.max(0.05, parsed));
}

async function fetchJson(url) {
  const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "github-readme-streak-terminal",
  };
  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub API: HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchContributions(githubId) {
  const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!githubToken) {
    throw new Error("GITHUB_TOKEN or GH_TOKEN is required to query GitHub contributions GraphQL API.");
  }

  const query = `
    query($login: String!) {
      user(login: $login) {
        createdAt
        contributionsCollection {
          contributionYears
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

  const res = await fetch(GITHUB_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${githubToken}`,
      "User-Agent": "github-readme-streak-terminal",
    },
    body: JSON.stringify({ query, variables: { login: githubId } }),
  });

  if (!res.ok) {
    throw new Error(`GitHub GraphQL error: HTTP ${res.status}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`GitHub GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  const user = json.data?.user;
  if (!user) {
    throw new Error(`GitHub user '${githubId}' not found.`);
  }

  const years = user.contributionsCollection.contributionYears || [];
  const contributions = {};

  for (const year of years) {
    const from = `${year}-01-01T00:00:00Z`;
    const to = `${year}-12-31T23:59:59Z`;
    const yearQuery = `
      query($login: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $login) {
          contributionsCollection(from: $from, to: $to) {
            contributionCalendar {
              weeks {
                contributionDays {
                  date
                  contributionCount
                }
              }
            }
          }
        }
      }
    `;
    const yrRes = await fetch(GITHUB_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${githubToken}`,
        "User-Agent": "github-readme-streak-terminal",
      },
      body: JSON.stringify({ query: yearQuery, variables: { login: githubId, from, to } }),
    });
    if (!yrRes.ok) continue;
    const yrJson = await yrRes.json();
    const weeks = yrJson.data?.user?.contributionsCollection?.contributionCalendar?.weeks || [];
    for (const week of weeks) {
      for (const day of week.contributionDays) {
        contributions[day.date] = day.contributionCount;
      }
    }
  }

  return contributions;
}

function formatShortDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function formatRange(range) {
  if (!range) return "No active streak";
  if (range.start === range.end) return formatShortDate(range.start);
  return `${formatShortDate(range.start)} - ${formatShortDate(range.end)}`;
}

function computeStreaks(contributions) {
  const dates = Object.keys(contributions).sort();
  if (dates.length === 0) {
    return {
      totalContributions: 0,
      currentStreak: 0,
      longestStreak: 0,
      currentRange: null,
      longestRange: null,
      totalRange: null,
    };
  }

  let totalContributions = 0;
  let longestStreak = 0;
  let longestStart = null;
  let longestEnd = null;
  let runStart = null;
  let runLength = 0;

  for (const dateStr of dates) {
    const count = contributions[dateStr];
    totalContributions += count;
    if (count > 0) {
      if (runLength === 0) runStart = dateStr;
      runLength += 1;
      if (runLength > longestStreak) {
        longestStreak = runLength;
        longestStart = runStart;
        longestEnd = dateStr;
      }
    } else {
      runLength = 0;
      runStart = null;
    }
  }

  let currentStreak = 0;
  let currentStart = null;
  let currentEnd = null;
  const lastIndex = dates.length - 1;

  for (let i = lastIndex; i >= 0; i -= 1) {
    const dateStr = dates[i];
    const count = contributions[dateStr];

    if (i === lastIndex && count === 0) {
      continue;
    }

    if (count > 0) {
      if (currentStreak === 0) currentEnd = dateStr;
      currentStreak += 1;
      currentStart = dateStr;
    } else {
      break;
    }
  }

  return {
    totalContributions,
    currentStreak,
    longestStreak,
    currentRange: currentStreak > 0 ? { start: currentStart, end: currentEnd } : null,
    longestRange: longestStreak > 0 ? { start: longestStart, end: longestEnd } : null,
    totalRange: { start: dates[0], end: dates[lastIndex] },
  };
}

function buildStreakPrompt(themeName, githubId) {
  const palette = (THEMES[themeName] ?? THEMES.mac).palette;
  if (themeName === "windows") {
    return [
      { text: "PS ", fill: palette.purple },
      { text: `C:\\Users\\${githubId}`, fill: palette.yellow },
      { text: "> ", fill: palette.fg },
    ];
  }
  if (themeName === "ubuntu") {
    return [
      { text: `${githubId}@ubuntu`, fill: palette.green },
      { text: ":~", fill: palette.fg },
      { text: "$ ", fill: palette.fg },
    ];
  }
  return [
    { text: `${githubId}@MacBook`, fill: palette.green },
    { text: " ~ ", fill: palette.blue },
    { text: "% ", fill: palette.fg },
  ];
}

function buildStreakCommand(themeName, githubId) {
  if (themeName === "windows") return `Get-GHStreak ${githubId}`;
  if (themeName === "ubuntu") return `gh streak view ${githubId}`;
  return `gh streak ${githubId}`;
}

function flamePath(cx, cy, scale = 1) {
  const p = [
    [0, -15], [4.5, -8], [7, -1], [5, 5], [0, 8],
    [-5, 5], [-7, -1], [-4.5, -8],
  ].map(([dx, dy]) => `${cx + dx * scale},${cy + dy * scale}`);
  return `M${p[0]} C${p[1]} ${p[2]} ${p[3]} C${p[4]} ${p[5]} ${p[6]} C${p[7]} ${p[0]} ${p[0]} Z`;
}

export async function generateStreakSvg(themeName, githubId, options = {}) {
  const theme = THEMES[themeName] ?? THEMES.mac;
  const palette = theme.palette;

  const contributions = await fetchContributions(githubId);
  const streakData = computeStreaks(contributions);

  let profile = null;
  let partial = false;
  try {
    profile = await fetchJson(`${GITHUB_API_BASE}/users/${encodeURIComponent(githubId)}`);
  } catch {
    partial = true;
  }

  const login = profile?.login || githubId;

  const termX = 12;
  const termY = 12;
  const headerH = 38;
  const promptY = 78;
  const statsCardX = 32;
  const statsCardY = 142;
  const statsCardH = 184;
  const stripWidth = 152;
  const fetchLineY = promptY + 22;
  const successLineY = fetchLineY + 20;
  const bottomPromptY = statsCardY + statsCardH + 28;
  const termBottomPadding = 22;

  const width = 856;
  const termW = width - termX * 2;
  const statsCardW = width - statsCardX * 2;

  const termBodyTop = termY + headerH;
  const termH = bottomPromptY + termBottomPadding - termY;
  const height = termY + termH + 12;
  const outputScale = resolveOutputScale(options.scale);
  const outputWidth = Math.round(width * outputScale);
  const outputHeight = Math.round(height * outputScale);

  const contentX0 = statsCardX + stripWidth;
  const borderColor = palette.border;
  const labelColor = "#c9d1d9";
  const dateColor = "#8b949e";
  const valueColor = "#ffffff";
  const titleColor = palette.accent;
  const stripHandle = partial ? `@${login} *` : `@${login}`;

  const promptParts = buildStreakPrompt(themeName, githubId);
  const promptStartX = 32;
  const commandText = buildStreakCommand(themeName, githubId);
  const promptW = promptPartsWidth(promptParts, 15);
  const commandW = textWidth(commandText, 15);
  const commandX = promptStartX + promptW + 3;
  const commandClipId = "streak-command-typing-clip";
  const fetchClipId = "streak-fetch-typing-clip";
  const fetchText = "Calculating streak from GitHub GraphQL API...";
  const fetchWidth = textWidth(fetchText, 13);

  const timeline = {
    typingDuration: 1.1,
    fetchStart: 1.1,
    fetchDuration: 0.7,
    successAt: 1.8,
    streakAt: 1.9,
    bottomAt: 2.25,
    blinkDuration: 0.8,
    cycleDuration: 2.25,
  };
  timeline.typingRatio = (timeline.typingDuration / timeline.cycleDuration).toFixed(6);
  timeline.fetchStartRatio = (timeline.fetchStart / timeline.cycleDuration).toFixed(6);
  timeline.fetchEndRatio = ((timeline.fetchStart + timeline.fetchDuration) / timeline.cycleDuration).toFixed(6);

  const controlsY = termY + 19;
  const controlsX = themeName === "mac"
    ? termX + 18
    : (themeName === "windows" ? termX + termW - 74 : termX + termW - 62);

  // Upgraded contribution card proportions
  const ringCenterY = statsCardY + 72;
  const ringRadius = 38;
  const flameCenterY = ringCenterY - ringRadius + 1;
  const numberY = ringCenterY + 10;
  const labelY = ringCenterY + ringRadius + 24;
  const rangeY = labelY + 18;

  const colW = (statsCardW - stripWidth) / 3;
  const col0X = contentX0 + colW * 0.5;
  const col1X = contentX0 + colW * 1.5;
  const col2X = contentX0 + colW * 2.5;
  const sepX0 = contentX0 + colW;
  const sepX1 = contentX0 + colW * 2;

  const svg = [];
  svg.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  svg.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${outputHeight}" viewBox="0 0 ${width} ${height}" role="img" aria-label="GitHub streak card for ${escapeXml(githubId)}">`);
  svg.push(`<title>${escapeXml(theme.title(githubId))}</title>`);
  svg.push(`<defs>`);
  svg.push(`<style>${createAnimationCss(timeline)}${REDUCED_MOTION_CSS}</style>`);
  svg.push(`<linearGradient id="streakRingGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#58a6ff"/><stop offset="100%" stop-color="#39d2c0"/></linearGradient>`);
  svg.push(`<clipPath id="${commandClipId}"><rect x="${commandX}" y="${promptY - 16}" width="0" height="22"><animate attributeName="width" values="0;${commandW + 6};${commandW + 6}" keyTimes="0;${timeline.typingRatio};1" dur="${timeline.cycleDuration}s" fill="freeze" /></rect></clipPath>`);
  svg.push(`<clipPath id="${fetchClipId}"><rect x="${promptStartX}" y="${fetchLineY - 16}" width="0" height="20"><animate attributeName="width" values="0;0;${fetchWidth + 6};${fetchWidth + 6}" keyTimes="0;${timeline.fetchStartRatio};${timeline.fetchEndRatio};1" dur="${timeline.cycleDuration}s" fill="freeze" /></rect></clipPath>`);
  svg.push(`</defs>`);

  // Outer Terminal Window
  svg.push(`<rect x="${termX}" y="${termY}" width="${termW}" height="${termH}" rx="12" fill="${theme.frameBg}" stroke="${borderColor}" stroke-width="1"/>`);
  svg.push(`<rect x="${termX + 1}" y="${termBodyTop}" width="${termW - 2}" height="${termH - headerH - 12}" rx="0" fill="${theme.bodyBg}"/>`);
  svg.push(`<rect x="${termX + 1}" y="${termY + 1}" width="${termW - 2}" height="${headerH}" rx="11" fill="${theme.headerBg}"/>`);
  svg.push(`<line x1="${termX}" y1="${termBodyTop}" x2="${termX + termW}" y2="${termBodyTop}" stroke="${borderColor}" stroke-width="1"/>`);
  svg.push(theme.controlsSvg(controlsX, controlsY));
  svg.push(`<text x="${termX + termW / 2}" y="${termY + 24}" font-size="13" font-family="'Source Code Pro', Consolas, Menlo, monospace" fill="#8b949e" text-anchor="middle">${escapeXml(theme.title(githubId))}</text>`);

  // Prompt + Typed Command
  svg.push(addTextSpans(promptParts, promptStartX, promptY, 15));
  svg.push(`<text x="${commandX}" y="${promptY}" fill="${theme.text}" font-size="15" font-family="'Source Code Pro', Consolas, Menlo, monospace" clip-path="url(#${commandClipId})">${escapeXml(commandText)}</text>`);
  svg.push(`<text class="typing-cursor" x="${commandX}" y="${promptY}" fill="${palette.fg}" font-size="15" font-family="'Source Code Pro', Consolas, Menlo, monospace">█<animate attributeName="x" values="${commandX};${commandX + commandW + 2};${commandX + commandW + 2}" keyTimes="0;${timeline.typingRatio};1" dur="${timeline.cycleDuration}s" fill="freeze" /></text>`);

  svg.push(`<g class="line-fetch">`);
  svg.push(`<text x="${promptStartX}" y="${fetchLineY}" fill="${palette.mute}" font-size="13" font-family="'Source Code Pro', Consolas, Menlo, monospace" clip-path="url(#${fetchClipId})">${escapeXml(fetchText)}</text>`);
  svg.push(`</g>`);

  svg.push(`<g class="line-success">`);
  svg.push(`<text x="${promptStartX}" y="${successLineY}" font-size="13" font-family="'Source Code Pro', Consolas, Menlo, monospace"><tspan fill="${palette.green}">\u2714 </tspan><tspan fill="${theme.text}">${escapeXml(`Success! Generated GitHub streak for '${githubId}'.`)}</tspan></text>`);
  svg.push(`</g>`);

  // Upgraded Contribution Window Card
  svg.push(`<g class="line-streak">`);
  const stripCenterX = statsCardX + stripWidth / 2;
  const stripCenterY = statsCardY + statsCardH / 2;

  svg.push(`<rect x="${statsCardX}" y="${statsCardY}" width="${statsCardW}" height="${statsCardH}" rx="12" fill="#151b23" stroke="${borderColor}" stroke-width="1"/>`);
  svg.push(`<text x="${stripCenterX}" y="${stripCenterY - 30}" font-size="13" font-family="'Source Code Pro', Consolas, Menlo, monospace" fill="${titleColor}" text-anchor="middle" letter-spacing="2">${ASCII_ACCENT}</text>`);
  svg.push(`<text x="${stripCenterX}" y="${stripCenterY - 8}" font-size="18" font-family="'Source Code Pro', Consolas, Menlo, monospace" fill="${valueColor}" font-weight="700" text-anchor="middle" letter-spacing="1">GITHUB</text>`);
  svg.push(`<text x="${stripCenterX}" y="${stripCenterY + 14}" font-size="18" font-family="'Source Code Pro', Consolas, Menlo, monospace" fill="${titleColor}" font-weight="700" text-anchor="middle" letter-spacing="1">STREAK</text>`);
  svg.push(`<text x="${stripCenterX}" y="${stripCenterY + 34}" font-size="11" font-family="'Source Code Pro', Consolas, Menlo, monospace" fill="${dateColor}" text-anchor="middle">${escapeXml(truncateFit(stripHandle, 18))}</text>`);

  // Subtle low-opacity vertical dividers
  svg.push(`<line x1="${contentX0}" y1="${statsCardY + 18}" x2="${contentX0}" y2="${statsCardY + statsCardH - 18}" stroke="${borderColor}" stroke-width="1"/>`);
  svg.push(`<line x1="${sepX0}" y1="${statsCardY + 24}" x2="${sepX0}" y2="${statsCardY + statsCardH - 24}" stroke="${borderColor}" stroke-width="1"/>`);
  svg.push(`<line x1="${sepX1}" y1="${statsCardY + 24}" x2="${sepX1}" y2="${statsCardY + statsCardH - 24}" stroke="${borderColor}" stroke-width="1"/>`);

  // Column 1: Total Contributions
  svg.push(`<text x="${col0X}" y="${numberY}" font-size="30" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" fill="${valueColor}" font-weight="700" text-anchor="middle">${formatNumber(streakData.totalContributions)}</text>`);
  svg.push(`<text x="${col0X}" y="${labelY}" font-size="14" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" fill="${labelColor}" font-weight="500" text-anchor="middle">Total Contributions</text>`);
  svg.push(`<text x="${col0X}" y="${rangeY}" font-size="11" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" fill="${dateColor}" text-anchor="middle">${escapeXml(formatRange(streakData.totalRange))}</text>`);

  // Column 2: Current Streak (Blue-to-Cyan Gradient Ring + Centered Flame)
  svg.push(`<circle cx="${col1X}" cy="${ringCenterY}" r="${ringRadius}" fill="none" stroke="url(#streakRingGrad)" stroke-width="3.5"/>`);
  svg.push(`<circle cx="${col1X}" cy="${flameCenterY}" r="11" fill="#151b23"/>`);
  svg.push(`<path d="${flamePath(col1X, flameCenterY + 2, 1.2)}" fill="url(#streakRingGrad)"/>`);
  svg.push(`<text x="${col1X}" y="${numberY}" font-size="30" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" fill="${valueColor}" font-weight="700" text-anchor="middle">${formatNumber(streakData.currentStreak)}</text>`);
  svg.push(`<text x="${col1X}" y="${labelY}" font-size="14" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" fill="${valueColor}" font-weight="600" text-anchor="middle">Current Streak</text>`);
  svg.push(`<text x="${col1X}" y="${rangeY}" font-size="11" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" fill="${dateColor}" text-anchor="middle">${escapeXml(formatRange(streakData.currentRange))}</text>`);

  // Column 3: Longest Streak
  svg.push(`<text x="${col2X}" y="${numberY}" font-size="30" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" fill="${valueColor}" font-weight="700" text-anchor="middle">${formatNumber(streakData.longestStreak)}</text>`);
  svg.push(`<text x="${col2X}" y="${labelY}" font-size="14" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" fill="${labelColor}" font-weight="500" text-anchor="middle">Longest Streak</text>`);
  svg.push(`<text x="${col2X}" y="${rangeY}" font-size="11" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" fill="${dateColor}" text-anchor="middle">${escapeXml(formatRange(streakData.longestRange))}</text>`);
  svg.push(`</g>`);

  // Bottom Prompt
  svg.push(`<g class="line-bottom">`);
  svg.push(addTextSpans(promptParts, promptStartX, bottomPromptY, 15));
  svg.push(`<text class="cursor" x="${promptStartX + promptPartsWidth(promptParts, 15)}" y="${bottomPromptY}" fill="${palette.fg}" font-size="15" font-family="'Source Code Pro', Consolas, Menlo, monospace">█</text>`);
  svg.push(`</g>`);

  svg.push(`</svg>`);
  return svg.join("\n");
}

// CLI execution
const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  const githubId = process.env.GITHUB_USERNAME || process.argv[2] || "ImNotHari";
  const themeName = process.env.STREAK_THEME || process.argv[3] || "mac";
  const outPath = process.argv[4] || path.resolve(__dirname, "..", "assets", "streak.svg");

  const svgContent = await generateStreakSvg(themeName, githubId);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, svgContent, "utf8");
  console.log(`Generated ${outPath} for ${githubId} (${themeName})`);
}
