const OPENWEATHERMAP_KEY = "6e3ef99dd1eabf920efb0c9042d4df61";
const API_BASE = "https://api.openweathermap.org/data/2.5";

// App state kept minimal
const state = {
  lastQuery: "",
  currentCityLabel: "",
  currentWeather: null,
  forecast: null,
  chart: null
};

// Element refs
const el = {
  q: () => document.getElementById("q"),
  btnSearch: () => document.getElementById("btnSearch"),
  btnUseLocation: () => document.getElementById("btnUseLocation"),
  status: () => document.getElementById("status"),
  current: () => document.getElementById("current"),
  forecast: () => document.getElementById("forecast"),
  favoritesList: () => document.getElementById("favoritesList"),
  btnAddFavorite: () => document.getElementById("btnAddFavorite"),
  btnClearFavorites: () => document.getElementById("btnClearFavorites"),
  tempChart: () => document.getElementById("tempChart")
};

// Utility: Celsius from Kelvin
const k2c = k => (k - 273.15);
// Utility: Fahrenheit
const k2f = k => (k2c(k) * 9/5 + 32);

// Utility: title case a label
function titleCase(s) {
  return s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

// Recursive fetch with exponential backoff for transient errors
async function fetchWithRetry(url, tries = 3, delayMs = 400) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      // 5xx may be transient
      if (res.status >= 500 && tries > 1) {
        await new Promise(r => setTimeout(r, delayMs));
        return fetchWithRetry(url, tries - 1, delayMs * 2); // recursion
      }
      // Non-retryable error
      const text = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
  } catch (err) {
    if (tries > 1) {
      await new Promise(r => setTimeout(r, delayMs));
      return fetchWithRetry(url, tries - 1, delayMs * 2); // recursion
    }
    throw err;
  }
}

// Build API URLs
const urlForCityCurrent = q =>
  `${API_BASE}/weather?q=${encodeURIComponent(q)}&appid=${OPENWEATHERMAP_KEY}`;

const urlForCityForecast = q =>
  `${API_BASE}/forecast?q=${encodeURIComponent(q)}&appid=${OPENWEATHERMAP_KEY}`;

const urlForGeo = (lat, lon) =>
  `${API_BASE}/weather?lat=${lat}&lon=${lon}&appid=${OPENWEATHERMAP_KEY}`;

// Status helper
function setStatus(msg, tone = "info") {
  const s = el.status();
  s.textContent = msg;
  s.style.color = tone === "error" ? "#ef4444" : "#9ca3af";
}

// Favorites in localStorage
const FAV_KEY = "weather_favorites";
function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAV_KEY)) || [];
  } catch {
    return [];
  }
}
function saveFavorites(list) {
  localStorage.setItem(FAV_KEY, JSON.stringify(list));
}
function renderFavorites() {
  const favs = getFavorites();
  const box = el.favoritesList();
  box.innerHTML = "";
  favs.forEach(label => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = label;
    chip.title = "Search this favorite";
    chip.addEventListener("click", () => {
      el.q().value = label;
      searchByQuery();
    });
    box.appendChild(chip);
  });
}

// Main search flows
async function searchByQuery() {
  const q = el.q().value.trim();
  if (!q) {
    setStatus("Enter a city or ZIP");
    return;
  }
  await searchCommon(q);
}

async function searchByLocation() {
  if (!navigator.geolocation) {
    setStatus("Geolocation not available", "error");
    return;
  }
  setStatus("Getting location...");
  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude, longitude } = pos.coords;
    try {
      setStatus("Loading weather...");
      const current = await fetchWithRetry(urlForGeo(latitude, longitude));
      // Reuse city name from response
      const label = [current?.name, current?.sys?.country].filter(Boolean).join(", ");
      const [cur, fc] = await Promise.all([
        Promise.resolve(current),
        fetchWithRetry(`${API_BASE}/forecast?lat=${latitude}&lon=${longitude}&appid=${OPENWEATHERMAP_KEY}`)
      ]);
      state.currentWeather = cur;
      state.forecast = fc;
      state.currentCityLabel = label;
      renderAll();
      setStatus(`Loaded ${label}`);
    } catch (err) {
      console.error(err);
      setStatus(`Error: ${err.message}`, "error");
    }
  }, err => {
    setStatus("Location permission denied", "error");
  });
}

async function searchCommon(q) {
  try {
    setStatus("Loading weather...");
    state.lastQuery = q;
    const [cur, fc] = await Promise.all([
      fetchWithRetry(urlForCityCurrent(q)),
      fetchWithRetry(urlForCityForecast(q))
    ]);
    state.currentWeather = cur;
    state.forecast = fc;
    // City label from API to keep it consistent
    const label = [cur?.name, cur?.sys?.country].filter(Boolean).join(", ");
    state.currentCityLabel = label || titleCase(q);
    renderAll();
    setStatus(`Loaded ${state.currentCityLabel}`);
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`, "error");
  }
}

// Renderers
function renderAll() {
  renderCurrent();
  renderForecast();
  renderChart();
}

function renderCurrent() {
  const box = el.current();
  const cur = state.currentWeather;
  if (!cur) {
    box.innerHTML = "";
    return;
  }
  const tempF = k2f(cur.main.temp).toFixed(1);
  const feelsF = k2f(cur.main.feels_like).toFixed(1);
  const desc = titleCase(cur.weather?.[0]?.description || "N/A");
  const wind = cur.wind?.speed ?? 0;
  const humidity = cur.main?.humidity ?? 0;
  const dt = dayjs.unix(cur.dt).format("ddd, MMM D h:mm A");

  // Simple comfort badge
  const comfort = (() => {
    if (humidity < 65 && wind < 7) return '<span class="badge ok">Comfortable</span>';
    if (humidity <= 80) return '<span class="badge warn">Muggy</span>';
    return '<span class="badge err">Humid</span>';
  })();

  box.innerHTML = `
    <h2>${state.currentCityLabel}</h2>
    <div class="kv">
      <div><strong>Now</strong></div><div>${dt}</div>
      <div><strong>Temp</strong></div><div>${tempF} °F</div>
      <div><strong>Feels</strong></div><div>${feelsF} °F</div>
      <div><strong>Conditions</strong></div><div>${desc}</div>
      <div><strong>Wind</strong></div><div>${wind} m/s</div>
      <div><strong>Humidity</strong></div><div>${humidity}% ${comfort}</div>
    </div>
  `;
}

function groupForecastByDay(list) {
  // OpenWeatherMap 3 hour slices. Group by date.
  const byDay = list.reduce((acc, item) => {
    const key = dayjs.unix(item.dt).format("YYYY-MM-DD");
    (acc[key] ||= []).push(item);
    return acc;
  }, {});
  // Map into summary tiles using ES6 methods
  return Object.entries(byDay).map(([day, entries]) => {
    const temps = entries.map(e => k2f(e.main.temp));
    const min = Math.min(...temps).toFixed(0);
    const max = Math.max(...temps).toFixed(0);

    // Most frequent condition text of the day
    const modeDesc = (() => {
      const counts = entries.reduce((m, e) => {
        const d = (e.weather?.[0]?.description || "n/a").toLowerCase();
        m.set(d, (m.get(d) || 0) + 1);
        return m;
      }, new Map());
      let best = "", bestN = -1;
      counts.forEach((n, k) => { if (n > bestN) { best = k; bestN = n; } });
      return titleCase(best);
    })();

    // Pick an icon from the midday entry if available
    const mid = entries[Math.floor(entries.length / 2)];
    const icon = mid?.weather?.[0]?.icon;

    return { day, min, max, desc: modeDesc, icon };
  });
}

function renderForecast() {
  const box = el.forecast();
  const fc = state.forecast;
  if (!fc?.list?.length) {
    box.innerHTML = "";
    return;
  }
  // Take next 5 distinct days
  const grouped = groupForecastByDay(fc.list).slice(0, 5);
  box.innerHTML = grouped.map(g => {
    const nice = dayjs(g.day).format("ddd, MMM D");
    const iconUrl = g.icon ? `https://openweathermap.org/img/wn/${g.icon}@2x.png` : "";
    return `
      <div class="tile">
        <div style="display:flex;align-items:center;gap:8px;">
          ${iconUrl ? `<img src="${iconUrl}" alt="${g.desc}" width="42" height="42" />` : ""}
          <h3 style="margin:0;">${nice}</h3>
        </div>
        <p style="margin:.25rem 0 .5rem;color:#9ca3af;">${g.desc}</p>
        <div class="kv">
          <div><strong>High</strong></div><div>${g.max} °F</div>
          <div><strong>Low</strong></div><div>${g.min} °F</div>
        </div>
      </div>
    `;
  }).join("");
}

function renderChart() {
  const canvas = el.tempChart();
  const fc = state.forecast;
  if (!fc?.list?.length) {
    if (state.chart) { state.chart.destroy(); state.chart = null; }
    return;
  }
  const labels = fc.list.slice(0, 16).map(e => dayjs.unix(e.dt).format("ddd ha"));
  const temps = fc.list.slice(0, 16).map(e => +k2f(e.main.temp).toFixed(1));

  if (state.chart) state.chart.destroy();
  state.chart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Temp °F",
        data: temps
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: true } },
      scales: { y: { beginAtZero: false } }
    }
  });
}

// Favorite handlers
function addFavorite() {
  const label = state.currentCityLabel || el.q().value.trim();
  if (!label) {
    setStatus("Nothing to save", "error");
    return;
  }
  const favs = getFavorites();
  if (!favs.some(x => x.toLowerCase() === label.toLowerCase())) {
    favs.push(label);
    saveFavorites(favs);
    renderFavorites();
    setStatus(`Saved favorite: ${label}`);
  } else {
    setStatus("Already in favorites");
  }
}
function clearFavorites() {
  saveFavorites([]);
  renderFavorites();
  setStatus("Cleared favorites");
}

// Wire up events
function init() {
  el.btnSearch().addEventListener("click", searchByQuery);
  el.btnUseLocation().addEventListener("click", searchByLocation);
  el.q().addEventListener("keydown", e => {
    if (e.key === "Enter") searchByQuery();
  });
  el.btnAddFavorite().addEventListener("click", addFavorite);
  el.btnClearFavorites().addEventListener("click", clearFavorites);
  renderFavorites();

  // Optional: default search for a quick demo
  // el.q().value = "Rexburg";
  // searchByQuery();
}

document.addEventListener("DOMContentLoaded", init);
