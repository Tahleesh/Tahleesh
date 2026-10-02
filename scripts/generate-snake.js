const fs = require("node:fs/promises");
const path = require("node:path");

const token = process.env.GITHUB_TOKEN;
const username = process.env.GITHUB_USERNAME || "Tahleesh";
const outputFile = process.env.OUTPUT_FILE || "dist/snake-luffy.svg";

if (!token) {
  throw new Error("GITHUB_TOKEN is missing. Run this script from its GitHub Actions workflow.");
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function contributionColor(count) {
  if (count === 0) return "#161b22";
  if (count < 3) return "#0e4429";
  if (count < 6) return "#006d32";
  if (count < 10) return "#26a641";
  return "#39d353";
}

function toSvgPath(points, offsetX = 0, offsetY = 0) {
  return points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x + offsetX} ${y + offsetY}`)
    .join(" ");
}

async function getContributionWeeks() {
  const today = new Date();
  const to = new Date(Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
    23,
    59,
    59,
  ));
  const from = new Date(to);
  from.setUTCFullYear(from.getUTCFullYear() - 1);

  const query = `
    query($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
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

  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "github-profile-contribution-snake",
    },
    body: JSON.stringify({
      query,
      variables: {
        login: username,
        from: from.toISOString(),
        to: to.toISOString(),
      },
    }),
  });

  const payload = await response.json();
  if (!response.ok || payload.errors?.length) {
    const detail = payload.errors?.map((error) => error.message).join("; ");
    throw new Error(`GitHub GraphQL request failed: ${detail || response.statusText}`);
  }

  const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar?.weeks?.length) {
    throw new Error(`No contribution calendar was returned for GitHub user "${username}".`);
  }

  return calendar;
}

function renderSvg(calendar) {
  const cell = 10;
  const gap = 4;
  const step = cell + gap;
  const left = 20;
  const top = 23;
  const bottom = 17;
  const weeks = calendar.weeks;
  const width = left * 2 + weeks.length * step - gap;
  const height = top + 7 * step - gap + bottom;
  const grid = weeks.map(() => Array.from({ length: 7 }, () => 0));

  weeks.forEach((week, column) => {
    week.contributionDays.forEach((day) => {
      const row = new Date(`${day.date}T00:00:00Z`).getUTCDay();
      grid[column][row] = Number(day.contributionCount);
    });
  });

  const cells = grid
    .map((days, column) =>
      days
        .map((count, row) => {
          const x = left + column * step;
          const y = top + row * step;
          return `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="2" fill="${contributionColor(count)}"><title>${count} contribution${count === 1 ? "" : "s"}</title></rect>`;
        })
        .join(""),
    )
    .join("");

  const points = [];
  for (let row = 0; row < 7; row += 1) {
    const columns = row % 2 === 0
      ? Array.from({ length: weeks.length }, (_, index) => index)
      : Array.from({ length: weeks.length }, (_, index) => weeks.length - 1 - index);

    for (const column of columns) {
      points.push([
        left + column * step + cell / 2,
        top + row * step + cell / 2,
      ]);
    }
  }

  const motionPath = toSvgPath(points);
  const hatPath = toSvgPath(points, -11, -17);
  const duration = "48s";
  const body = Array.from({ length: 7 }, (_, index) => {
    const colors = ["#2ea043", "#2ea043", "#3fb950", "#3fb950", "#56d364", "#56d364", "#7ee787"];
    const delay = -((index + 1) * 0.13);
    return `<circle r="4.7" fill="${colors[index]}" stroke="#0d1117" stroke-width="1.5"><animateMotion dur="${duration}" begin="${delay}s" repeatCount="indefinite" path="${motionPath}"/></circle>`;
  }).join("");

  const safeUsername = xmlEscape(username);
  const total = Number(calendar.totalContributions || 0);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">${safeUsername}'s animated contribution snake</title>
  <desc id="description">A green snake wearing a yellow straw hat with a red band travels through a dark GitHub contribution calendar. ${total} contributions are shown for the last year.</desc>
  <rect width="${width}" height="${height}" rx="9" fill="#0d1117"/>
  <g>${cells}</g>
  <g aria-hidden="true">${body}</g>
  <g aria-hidden="true">
    <circle r="5.2" fill="#7ee787" stroke="#0d1117" stroke-width="1.5">
      <animateMotion dur="${duration}" repeatCount="indefinite" path="${motionPath}"/>
    </circle>
    <circle r="1" cx="-2" cy="-1" fill="#0d1117">
      <animateMotion dur="${duration}" repeatCount="indefinite" path="${motionPath}"/>
    </circle>
    <circle r="1" cx="2" cy="-1" fill="#0d1117">
      <animateMotion dur="${duration}" repeatCount="indefinite" path="${motionPath}"/>
    </circle>
  </g>
  <g aria-hidden="true">
    <animateMotion dur="${duration}" repeatCount="indefinite" path="${hatPath}"/>
    <path d="M6 7V4.5C6 2.6 7.5 1 9.4 1h4.2C15.5 1 17 2.6 17 4.5V7h2.4c.8 0 1.4.7 1.4 1.5S20.2 10 19.4 10H2.6c-.8 0-1.4-.7-1.4-1.5S1.8 7 2.6 7H6Z" fill="#f4c542" stroke="#8a5b12" stroke-width="1"/>
    <path d="M6.4 6.1h10.2V8H6.4z" fill="#e53935"/>
    <path d="M2.1 8.4h17.8" fill="none" stroke="#d9a62e" stroke-width=".8"/>
  </g>
</svg>`;
}

async function main() {
  const calendar = await getContributionWeeks();
  const svg = renderSvg(calendar);
  const destination = path.resolve(outputFile);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, svg, "utf8");
  console.log(`Generated ${destination} for ${username} (${calendar.totalContributions} contributions).`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});