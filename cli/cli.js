#!/usr/bin/env node
/**
 * Weather CLI
 * Prints a brief multi-day forecast to the terminal.
 * Uses node-fetch and chalk (3rd-party libs).
 */
import fetch from "node-fetch";
import chalk from "chalk";
import dayjs from "dayjs";

const API = "https://api.openweathermap.org/data/2.5";
const KEY = process.env.OWM_KEY;

if (!KEY) {
  console.error(chalk.red("Set OWM_KEY env var to your OpenWeatherMap API key."));
  process.exit(1);
}

const q = process.argv.slice(2).join(" ") || "Rexburg";

const k2f = k => (k - 273.15) * 9/5 + 32;

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status}: ${text || r.statusText}`);
  }
  return r.json();
}

// Simple recursion for retry
async function retry(fn, tries = 3, delay = 300) {
  try { return await fn(); }
  catch (e) {
    if (tries <= 1) throw e;
    await new Promise(r => setTimeout(r, delay));
    return retry(fn, tries - 1, delay * 2);
  }
}

function groupByDay(list) {
  const by = list.reduce((acc, it) => {
    const key = dayjs.unix(it.dt).format("YYYY-MM-DD");
    (acc[key] ||= []).push(it);
    return acc;
  }, {});
  return Object.entries(by).map(([day, arr]) => {
    const temps = arr.map(e => k2f(e.main.temp));
    const min = Math.min(...temps).toFixed(0);
    const max = Math.max(...temps).toFixed(0);
    const desc = arr
      .map(e => e.weather?.[0]?.description || "n/a")
      .reduce((m, s) => (m[s] = (m[s] || 0) + 1, m), {});
    const top = Object.entries(desc).sort((a, b) => b[1] - a[1])[0]?.[0] || "n/a";
    return { day, min, max, desc: top };
  });
}

(async () => {
  try {
    const curUrl = `${API}/weather?q=${encodeURIComponent(q)}&appid=${KEY}`;
    const fcUrl = `${API}/forecast?q=${encodeURIComponent(q)}&appid=${KEY}`;

    const [cur, fc] = await Promise.all([
      retry(() => fetchJson(curUrl)),
      retry(() => fetchJson(fcUrl))
    ]);

    const city = [cur?.name, cur?.sys?.country].filter(Boolean).join(", ");
    const nowF = k2f(cur.main.temp).toFixed(1);
    const nowDesc = cur.weather?.[0]?.description || "n/a";

    console.log(chalk.cyan.bold(`\n${city}`));
    console.log(`${chalk.gray(dayjs.unix(cur.dt).format("ddd, MMM D h:mm A"))}`);
    console.log(`Now: ${chalk.yellow(nowF + " °F")}  ${titleCase(nowDesc)}\n`);

    const days = groupByDay(fc.list).slice(0, 5);
    for (const d of days) {
      console.log(`${chalk.green(dayjs(d.day).format("ddd, MMM D"))}: high ${d.max} °F  low ${d.min} °F  ${titleCase(d.desc)}`);
    }
    console.log("");
  } catch (e) {
    console.error(chalk.red(e.message));
    process.exit(1);
  }
})();

function titleCase(s) {
  return s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
}
