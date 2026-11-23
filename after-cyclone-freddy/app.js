// app.js — "After Cyclone Freddy" webGIS story (Leaflet 1.9.4)

const PORTFOLIO_URL = "https://claude.ai/artifact/6NUTXCc6cvXRfct34aMsQB"; // swap for your public portfolio link
document.getElementById("portfolio-link").href = PORTFOLIO_URL;

const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const C = { ink: "#13232B",  // map linework stays dark: basemaps are light in both themes
             teal: css("--teal"), ochre: css("--ochre"), hosp: css("--hosp"),
            site: css("--site"), drone: css("--drone"), muted: css("--muted") };
// Distance to nearest public facility (km): light -> dark
const RAMP = [[2, "#EEF3D6"], [5, "#F2C66D"], [8, "#E07B39"], [Infinity, "#A3342A"]];
const rampColor = km => RAMP.find(([max]) => km < max)[1];
const TYPE_LABEL = { hospital: "Hospital", health_centre: "Health centre", health_post: "Health post / dispensary", clinic: "Clinic" };
const slug = s => s.toLowerCase().replace(/\s+/g, "-");
const fmt = n => Number(n).toLocaleString("en-GB", { maximumFractionDigits: 1 });
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- Map ----------
const map = L.map("map", { preferCanvas: true }).setView([-15.75, 35.0], 10);
const basemaps = {
  "Light grey (Esri)": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 16, attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors" }),
  "Streets (OSM)": L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }),
  "Satellite (Esri)": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19, attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics" }),
};
basemaps["Light grey (Esri)"].addTo(map);
L.control.layers(basemaps, null, { position: "topright" }).addTo(map);
L.control.scale({ metric: true, imperial: false }).addTo(map);

const load = f => fetch(`data/${f}?v=9`).then(r => { if (!r.ok) throw new Error(`${f}: ${r.status}`); return r.json(); });

Promise.all(["district.geojson", "ta.geojson", "hex.geojson", "facilities.geojson", "sites.geojson",
             "drone_range.geojson", "second_hub.geojson", "second_range.geojson", "stats.json"].map(load))
.then(([district, ta, hex, facilities, sites, droneRange, secondHub, secondRange, S]) => {
  const L_ = buildLayers({ district, ta, hex, facilities, sites, droneRange, secondHub, secondRange });
  const chapters = buildChapters(S, L_);
  startStory(chapters, L_);
  enableNearestTool(facilities.features);
}).catch(err => {
  document.getElementById("chapter").innerHTML =
    `<h2>Map data failed to load</h2><p>${esc(err.message)}. If you opened index.html from disk, run it through a local web server.</p>`;
});

// ---------- Layers ----------
function buildLayers({ district, ta, hex, facilities, sites, droneRange, secondHub, secondRange }) {
  const sitePopup = p => `
    <b>${esc(p.name)}</b><br><span style="opacity:.7">${esc(p.ta || "")} · surveyed ${esc(p.survey_date)}</span>
    <table>
      <tr><td>Displaced people</td><td><b>${fmt(p.people)}</b> (${fmt(p.under5)} under 5)</td></tr>
      <tr><td>Displaced by</td><td>${esc(p.reasons)}</td></tr>
      <tr><td>Health service on site</td><td>${esc(p.health_on_site || "not recorded")}</td></tr>
      <tr><td>Health worker visits</td><td>${esc(p.health_visits || "not recorded")}</td></tr>
      <tr><td>Top health problems</td><td>${esc([p.health_problem_1, p.health_problem_2].filter(x => x && x !== "None").join(", "))}</td></tr>
      <tr><td>Access</td><td>${p.foot_only ? "Foot, bicycle or motorbike only" : "Vehicle access"}</td></tr>
      <tr><td>Nearest public facility</td><td>${esc(p.nearest_public)}, ${fmt(p.dist_public_km)} km</td></tr>
      <tr><td>Motorised travel time</td><td>${p.travel_min != null ? fmt(p.travel_min) + " min" : "n/a"}</td></tr>
      <tr><td>Nearest drone hub</td><td>${esc(p.nearest_hub)}, ${fmt(p.dist_hub_km)} km${p.drone_priority ? " · <b>drone priority</b>" : ""}</td></tr>
    </table>`;
  const siteRadius = p => Math.max(4, Math.sqrt(p.people) * 0.55);

  return {
    district: L.geoJSON(district, { style: { color: C.ink, weight: 2.5, fill: false }, interactive: false }),
    ta: L.geoJSON(ta, {
      style: { color: C.ink, weight: 0.6, opacity: 0.5, fill: true, fillOpacity: 0 },
      onEachFeature: (f, l) => l.bindTooltip(`${esc(f.properties.name)}<br>${fmt(f.properties.pop)} people · ${fmt(f.properties.pct_gt5_pub)}% &gt; 5 km from public care`, { sticky: true }),
    }),
    hex: L.geoJSON(hex, {
      style: f => ({ stroke: false, fillColor: rampColor(f.properties.d_pub),
                     fillOpacity: Math.min(0.85, 0.25 + Math.log10(1 + f.properties.pop) / 5) }),
      interactive: false,
    }),
    facAll: L.geoJSON(facilities, {
      pointToLayer: (f, ll) => {
        const p = f.properties;
        return L.circleMarker(ll, p.public
          ? { radius: p.type === "hospital" ? 7 : 5, color: "#fff", weight: 1.5, fillColor: p.type === "hospital" ? C.hosp : C.teal, fillOpacity: 1 }
          : { radius: 3, color: C.muted, weight: 1, fillColor: C.muted, fillOpacity: 0.5 });
      },
      onEachFeature: (f, l) => l.bindPopup(`<b>${esc(f.properties.name)}</b><br>${esc(f.properties.moh_type)} · ${esc(f.properties.owner)}`),
    }),
    facPublic: L.geoJSON(facilities, {
      filter: f => f.properties.public,
      pointToLayer: (f, ll) => L.circleMarker(ll, { radius: f.properties.type === "hospital" ? 7 : 5, color: "#fff", weight: 1.5,
        fillColor: f.properties.type === "hospital" ? C.hosp : C.teal, fillOpacity: 1 }),
      onEachFeature: (f, l) => l.bindPopup(`<b>${esc(f.properties.name)}</b><br>${esc(f.properties.moh_type)} · ${esc(f.properties.owner)}`),
    }),
    sites: L.geoJSON(sites, {
      pointToLayer: (f, ll) => {
        const p = f.properties;
        return L.circleMarker(ll, { radius: siteRadius(p), color: p.no_regular_health ? C.ochre : "#fff",
          weight: p.no_regular_health ? 3 : 1.5, fillColor: C.site, fillOpacity: 0.75 });
      },
      onEachFeature: (f, l) => l.bindPopup(sitePopup(f.properties), { maxWidth: 320 }),
    }),
    hubs: L.geoJSON(facilities, {
      filter: f => f.properties.hub,
      pointToLayer: (f, ll) => L.marker(ll, { icon: L.divIcon({ className: "", iconSize: [18, 18],
        html: `<div style="width:14px;height:14px;transform:rotate(45deg);background:${C.drone};border:2px solid #fff;box-shadow:0 0 0 1px ${C.drone}"></div>` }) }),
      onEachFeature: (f, l) => l.bindPopup(`<b>${esc(f.properties.name)}</b><br>Drone hub · ${esc(f.properties.moh_type)}`),
    }),
    droneRange: L.geoJSON(droneRange, { style: { color: C.drone, weight: 2, dashArray: "6 5", fillColor: C.drone, fillOpacity: 0.06 }, interactive: false }),
    secondRange: L.geoJSON(secondRange, { style: { color: C.drone, weight: 2, dashArray: "2 5", fillColor: C.drone, fillOpacity: 0.04 }, interactive: false }),
    secondHub: L.geoJSON(secondHub, {
      pointToLayer: (f, ll) => L.marker(ll, { icon: L.divIcon({ className: "", iconSize: [18, 18],
        html: `<div style="width:14px;height:14px;transform:rotate(45deg);background:#fff;border:3px solid ${C.drone}"></div>` }) }),
      onEachFeature: (f, l) => l.bindPopup(`<b>${esc(f.properties.name)}</b><br>Proposed second hub · reaches ${fmt(f.properties.people)} more people at ${f.properties.sites} priority sites`),
    }),
    sitesDrone: L.geoJSON(sites, {
      pointToLayer: (f, ll) => {
        const p = f.properties, gap = p.no_regular_health && p.foot_only && !p.in_drone_range;
        const ring = p.drone_priority ? C.drone : gap ? C.hosp : "#fff";
        return L.circleMarker(ll, { radius: siteRadius(p), color: ring, weight: p.drone_priority || gap ? 3.5 : 1,
          fillColor: p.drone_priority ? C.drone : C.site, fillOpacity: p.drone_priority ? 0.85 : gap ? 0.7 : 0.3 });
      },
      onEachFeature: (f, l) => l.bindPopup(sitePopup(f.properties), { maxWidth: 320 }),
    }),
  };
}

// ---------- Story ----------
function buildChapters(S, Ly) {
  const sitesBounds = Ly.sites.getBounds().pad(0.15);
  const districtBounds = Ly.district.getBounds();
  const legend = {
    sites: `<div class="row"><i class="sw dot" style="background:${C.site}"></i>Displacement site (size = people)</div>
            <div class="row"><i class="sw dot" style="background:${C.site};box-shadow:0 0 0 2.5px ${C.ochre}"></i>No regular health service on site</div>`,
    fac: `<div class="row"><i class="sw dot" style="background:${C.hosp}"></i>Public hospital</div>
          <div class="row"><i class="sw dot" style="background:${C.teal}"></i>Public health centre / post</div>
          <div class="row"><i class="sw dot" style="background:${C.muted};opacity:.6"></i>Private or fee-paying clinic</div>`,
    ramp: `<span class="eyebrow">Distance to nearest public facility</span>
           <div class="ramp">${RAMP.map(([, c]) => `<span style="background:${c}"></span>`).join("")}</div>
           <div class="ramp-labels"><span>0</span><span>2</span><span>5</span><span>8 km +</span></div>`,
    drone: `<div class="row"><i class="sw" style="background:${C.drone};transform:rotate(45deg);width:11px;height:11px"></i>Drone hub: ${esc(S.hub_names.join(", "))}</div>
            <div class="row"><i class="sw" style="border:2px dashed ${C.drone}"></i>${S.drone_radius_km} km delivery radius</div>
            <div class="row"><i class="sw dot" style="background:${C.drone}"></i>Priority site within range</div>
            <div class="row"><i class="sw dot" style="background:${C.site};box-shadow:0 0 0 2.5px ${C.hosp}"></i>Priority site out of range</div>`,
    second: `<div class="row"><i class="sw" style="background:#fff;border:2.5px solid ${C.drone};transform:rotate(45deg);width:11px;height:11px"></i>Proposed second hub</div>`,
  };
  return [
    { label: "Storm", layers: ["ta", "district", "sites"], view: districtBounds, legend: legend.sites, html: `
      <span class="eyebrow">1 · The storm</span>
      <h2>Cyclone Freddy drove thousands of Blantyre families from their homes</h2>
      <p>In March 2023 Cyclone Freddy brought days of extreme rain to southern Malawi. Floods and landslides hit Blantyre hard, and families sheltered in schools, churches and camps.</p>
      <div class="big">
        <div class="warn"><b>${fmt(S.displaced)}</b><span>people in ${S.sites} displacement sites (IOM DTM)</span></div>
        <div class="warn"><b>${fmt(S.under5)}</b><span>children under five</span></div>
      </div>
      <p class="note">Click any site to see who was there and what health support they had.</p>` },

    { label: "Network", layers: ["district", "facAll"], view: districtBounds, legend: legend.fac, html: `
      <span class="eyebrow">2 · The health network</span>
      <h2>Plenty of facilities on paper, few that are free</h2>
      <p>The Ministry of Health registry lists <b>${S.facilities}</b> facilities in Blantyre. Most are private clinics that charge fees. Only <b>${S.public_facilities}</b> are public hospitals, health centres or health posts run by government or CHAM.</p>
      <p class="note">Registry snapshot: February 2023, five weeks before Freddy. Some records have no coordinates and are not mapped.</p>` },

    { label: "Distance", layers: ["hex", "ta", "district", "facPublic"], view: districtBounds, legend: legend.ramp + legend.fac.split("</div>").slice(0, 2).join("</div>") + "</div>", html: `
      <span class="eyebrow">3 · Who is far from free care</span>
      <h2>${fmt(S.pop_gt5_pub)} people live more than 5 km from a public facility</h2>
      <div class="big">
        <div class="warn"><b>${fmt(S.pct_gt5_pub)}%</b><span>of ${fmt(S.population)} people beyond 5 km</span></div>
        <div><b>${fmt(S.median_tt_min)} min</b><span>median motorised travel time to care</span></div>
      </div>
      <p class="note">Each hexagon is 400 m wide and shaded by its distance to the nearest public facility; fainter hexagons have fewer people. Hover a ward or TA for its figures.</p>` },

    { label: "Sites", layers: ["hex", "district", "facPublic", "sites"], view: sitesBounds, legend: legend.sites + legend.ramp, html: `
      <span class="eyebrow">4 · Displaced and underserved</span>
      <h2>Close to clinics on a map, cut off on the ground</h2>
      <p>Most sites sit within a few kilometres of a public facility (median <b>${fmt(S.median_site_dist_pub_km)} km</b>), but the survey shows what distance hides:</p>
      <div class="big">
        <div class="warn"><b>${S.sites_no_regular_health} sites</b><span>${fmt(S.people_no_regular_health)} people with no regular health service</span></div>
        <div class="warn"><b>${S.sites_foot_only} of ${S.sites}</b><span>sites reachable only on foot, bicycle or motorbike</span></div>
      </div>
      <p class="note">Malaria was the top health problem at ${S.sites_malaria_top} of ${S.sites} sites, followed by coughs, flu and diarrhoea.</p>` },

    { label: "Drones", layers: ["district", "droneRange", "hubs", "sitesDrone"], view: Ly.droneRange.getLayers().length ? Ly.droneRange.getBounds() : sitesBounds, legend: legend.drone, html: `
      <span class="eyebrow">5 · Where drones close the gap</span>
      <h2>One hub at ${esc(S.hub_names[0])} reaches ${S.drone_priority_sites} of the hardest-to-serve sites</h2>
      <p>A priority site had <b>no regular health service</b> and could be reached <b>only on foot, bicycle or motorbike</b>. That is where a drone beats a vehicle.</p>
      <div class="big">
        <div><b>${S.drone_priority_sites} sites</b><span>${fmt(S.drone_priority_people)} people, ${fmt(S.drone_priority_under5)} under five, within ${S.drone_radius_km} km</span></div>
        <div class="warn"><b>${S.priority_out_of_range} sites</b><span>priority sites still out of range</span></div>
      </div>
      <p class="note">${S.drone_radius_km} km one-way leaves margin for the return leg, a battery reserve, a cool-box payload and Blantyre's hills. The hub covers ${fmt(S.pct_pop_in_drone_range)}% of the district's population.</p>` },

    { label: "Next hub", layers: ["district", "droneRange", "secondRange", "hubs", "secondHub", "sitesDrone"], view: Ly.droneRange.getBounds().extend(Ly.secondRange.getBounds()), legend: legend.drone + legend.second, html: `
      <span class="eyebrow">6 · Closing the last gap</span>
      <h2>A second hub at ${esc(S.second_hub.name)} reaches the remaining ${S.second_hub.sites} sites</h2>
      <p>Testing every public hospital and health centre as a second hub, <b>${esc(S.second_hub.name)}</b> brings the most uncovered priority-site people into range.</p>
      <div class="big">
        <div><b>+${fmt(S.second_hub.people)}</b><span>displaced people reached</span></div>
        <div><b>${S.drone_priority_sites + S.second_hub.sites} of ${S.drone_priority_sites + S.priority_out_of_range}</b><span>priority sites covered by two hubs</span></div>
      </div>
      <p class="note">A health centre hub needs cold-chain storage and a trained crew before it can launch flights, so the next step is a site assessment.</p>` },

    { label: "Explore", layers: ["hex", "district", "facPublic", "sites"], view: districtBounds, legend: legend.ramp + legend.sites, html: `
      <span class="eyebrow">7 · Explore &amp; method</span>
      <h2>Click anywhere to measure access</h2>
      <p>The map finds the nearest public facility and rates access from that point.</p>
      <p class="note"><b>Method.</b> Facilities from the MoH registry, sites from IOM DTM Round 1, population from Kontur 400 m hexagons, travel time from the CPAS 100 m motorised raster. Distances are straight-line, measured in WGS 84 / UTM 36S; facilities up to 15 km outside the district count, because people cross district lines for care.</p>
      <p class="note"><b>Limits.</b> Straight-line distance understates travel on Blantyre's hills; the registry's "functional" status is out of date, so all registered facilities are included; site data is a single survey round.</p>` },
  ];
}

function startStory(chapters, Ly) {
  let i = 0;
  const nav = document.getElementById("steps");
  chapters.forEach((c, k) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = c.label; b.addEventListener("click", () => go(k));
    nav.appendChild(b);
  });
  const prev = document.getElementById("prev"), next = document.getElementById("next");
  prev.addEventListener("click", () => go(i - 1));
  next.addEventListener("click", () => go(i + 1));

  function go(k) {
    i = Math.max(0, Math.min(chapters.length - 1, k));
    const c = chapters[i];
    Object.entries(Ly).forEach(([name, layer]) => c.layers.includes(name) ? layer.addTo(map) : map.removeLayer(layer));
    c.layers.forEach(name => Ly[name].bringToFront?.());
    map.flyToBounds(c.view, { padding: [20, 20], duration: matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1 });
    document.getElementById("chapter").innerHTML = c.html;
    document.getElementById("legend").innerHTML = c.legend;
    document.getElementById("count").textContent = `${i + 1} / ${chapters.length}`;
    [...nav.children].forEach((b, k2) => b.toggleAttribute("aria-current", false) || (k2 === i && b.setAttribute("aria-current", "step")));
    prev.disabled = i === 0;
    next.disabled = i === chapters.length - 1;
    try { history.replaceState(null, "", `#${slug(c.label)}`); } catch {}
  }
  const start = chapters.findIndex(c => `#${slug(c.label)}` === location.hash);
  go(start >= 0 ? start : 0);
}

// ---------- Nearest public facility tool ----------
function enableNearestTool(features) {
  const pub = features.filter(f => f.properties.public);
  const pin = L.layerGroup().addTo(map);
  const box = document.getElementById("result");
  map.on("click", e => {
    if (e.originalEvent?.target?.closest?.(".leaflet-interactive")) return; // clicks on features open their popup instead
    const { lat, lng } = e.latlng;
    let best = null;
    for (const f of pub) {
      const [flng, flat] = f.geometry.coordinates;
      const d = haversineKm(lat, lng, flat, flng);
      if (!best || d < best.d) best = { d, f };
    }
    const p = best.f.properties, [flng, flat] = best.f.geometry.coordinates;
    const rating = rateAccess(best.d, p.type); // defined in access.js
    pin.clearLayers();
    L.polyline([[lat, lng], [flat, flng]], { color: rating.color, weight: 3, dashArray: "6 6", interactive: false }).addTo(pin);
    L.circleMarker([lat, lng], { radius: 6, color: "#fff", weight: 2, fillColor: rating.color, fillOpacity: 1, interactive: false }).addTo(pin);
    box.hidden = false;
    box.innerHTML = `
      <span class="eyebrow">Nearest public facility from your click</span>
      <div class="dist">${best.d.toFixed(1)} km</div>
      <p style="margin:6px 0 0">to <b>${esc(p.name)}</b> (${TYPE_LABEL[p.type].toLowerCase()})</p>
      <span class="pill" style="background:${rating.color}">${esc(rating.label)}</span>
      <p class="muted mono" style="margin:8px 0 0">${Math.abs(lat).toFixed(4)}° S, ${lng.toFixed(4)}° E · straight-line</p>`;
  });
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371.0088, r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
