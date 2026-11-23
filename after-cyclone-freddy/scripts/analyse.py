"""After Freddy: health access and drone reach in Blantyre.

Run via scripts/build.sh, which first projects inputs to WGS 84 / UTM 36S (EPSG:32736)
into raw/utm_*.geojson. All distances here are therefore in metres.

Questions answered
1. How many people live more than 5 km / 8 km from (a) any facility, (b) a public facility?
2. For each Cyclone Freddy displacement site: how far to the nearest public facility,
   what motorised travel time, and does it have regular health services?
3. With drone hubs at the chosen facilities, which people and sites fall inside the delivery radius,
   and which sites meet Rudo's drone-priority rule?
"""
import json, subprocess, statistics
from pathlib import Path
import numpy as np
from shapely.geometry import shape, mapping, Point
from shapely.ops import unary_union
from shapely.prepared import prep
import drone_params as D

ROOT = Path(__file__).resolve().parents[1]; RAW = ROOT / "raw"; HUNT = ROOT.parent / "data_hunt"
GDAL = Path("C:/Program Files/QGIS 3.34.15/bin")
PUBLIC_OWNERS = {"Government", "Christian Health Association of Malawi (CHAM)"}
NO_SERVICE = {"No", "Never", "Irregular"}

def read(name): return json.load(open(RAW / f"utm_{name}.geojson"))["features"]
def write(name, feats): json.dump({"type": "FeatureCollection", "features": feats}, open(RAW / f"out_{name}.geojson", "w"), default=float)
def feat(geom, props): return {"type": "Feature", "geometry": mapping(geom), "properties": props}

# ---------- inputs ----------
adm2 = read("adm2"); adm3 = read("adm3")
district = unary_union([shape(f["geometry"]) for f in adm2])
# The district/city union leaves a stray boundary sliver; keep only the polygon parts.
district = unary_union([g for g in getattr(district, "geoms", [district]) if g.geom_type in ("Polygon", "MultiPolygon")]).buffer(0)
# Drop slivers under 1 ha: rounding coordinates for the web would collapse them into lines.
district = unary_union([g for g in getattr(district, "geoms", [district]) if g.area > 1e4])
study = district.buffer(15000)                       # facilities just over the line still serve residents
study_p, dist_p = prep(study), prep(district)

fac = [f for f in read("facilities") if study_p.contains(shape(f["geometry"]))]
FXY = np.array([f["geometry"]["coordinates"] for f in fac])
is_public = np.array([f["properties"]["owner"] in PUBLIC_OWNERS and f["properties"]["type"] != "clinic" for f in fac])
is_hub = np.array([f["properties"]["name"].lower() in {n.lower() for n in D.HUB_NAMES} for f in fac])
assert is_hub.any(), f"No facility matches HUB_NAMES {D.HUB_NAMES}"

hexes = []
for f in read("hex"):
    g = shape(f["geometry"]); c = g.centroid
    if dist_p.contains(c):
        hexes.append((g, c, float(f["properties"]["population"])))
sites = read("sites")

def nearest(xy, mask=None):
    """Distance (m) and index of nearest facility for each row of xy."""
    pts = FXY if mask is None else FXY[mask]
    idx = np.arange(len(FXY)) if mask is None else np.flatnonzero(mask)
    d = np.sqrt(((xy[:, None, :] - pts[None, :, :]) ** 2).sum(-1))
    j = d.argmin(1)
    return d[np.arange(len(xy)), j], idx[j]

def travel_time_min(xy):
    """Sample the CPAS motorised travel-time raster (seconds) at UTM points."""
    inp = "\n".join(f"{x} {y}" for x, y in xy)
    out = subprocess.run([str(GDAL / "gdallocationinfo.exe"), "-valonly", "-l_srs", "EPSG:32736",
                          str(HUNT / "cpas_motorised.tif")], input=inp, capture_output=True, text=True).stdout.split()
    return [round(float(v) / 60, 1) if v not in ("", "nan") and float(v) >= 0 else None for v in out]

# ---------- population access ----------
HXY = np.array([[c.x, c.y] for _, c, _ in hexes]); POP = np.array([p for *_, p in hexes])
d_any, _ = nearest(HXY); d_pub, _ = nearest(HXY, is_public); d_hub, _ = nearest(HXY, is_hub)
tt = travel_time_min(HXY)
hex_out = [feat(g, {"pop": round(p), "d_any": round(da / 1000, 1), "d_pub": round(dp / 1000, 1), "tt": t,
                    "drone": bool(dh <= D.DELIVERY_RADIUS_KM * 1000)})
           for (g, _, p), da, dp, dh, t in zip(hexes, d_any, d_pub, d_hub, tt)]
total = POP.sum()
share = lambda mask: round(100 * POP[mask].sum() / total, 1)

# ---------- per-TA / ward summary ----------
ta_out = []
for f in adm3:
    g = shape(f["geometry"])
    if not dist_p.intersects(g.representative_point()): continue
    pg = prep(g); m = np.array([pg.contains(c) for _, c, _ in hexes])
    pop = POP[m].sum()
    ta_out.append(feat(g, {"name": f["properties"]["adm3_name"], "pop": round(pop),
                           "pct_gt5_pub": round(100 * POP[m & (d_pub > 5000)].sum() / pop, 1) if pop else None}))

# ---------- displacement sites ----------
SXY = np.array([s["geometry"]["coordinates"] for s in sites])
s_any, _ = nearest(SXY); s_pub, j_pub = nearest(SXY, is_public); s_hub, j_hub = nearest(SXY, is_hub)
s_tt = travel_time_min(SXY)
site_out = []
for s, da, dp, jp, dh, jh, t in zip(sites, s_any, s_pub, j_pub, s_hub, j_hub, s_tt):
    p = dict(s["properties"])
    p.update(dist_facility_km=round(da / 1000, 2), dist_public_km=round(dp / 1000, 2),
             nearest_public=fac[jp]["properties"]["name"], travel_min=t,
             dist_hub_km=round(dh / 1000, 1), nearest_hub=fac[jh]["properties"]["name"],
             in_drone_range=bool(dh <= D.DELIVERY_RADIUS_KM * 1000),
             no_regular_health=p["health_on_site"] in NO_SERVICE,
             foot_only="foot" in (p["access"] or "").lower())
    p["drone_priority"] = bool(p["in_drone_range"] and D.is_drone_priority(p))
    site_out.append({"type": "Feature", "geometry": s["geometry"], "properties": p})

# ---------- facilities, hubs, drone range ----------
fac_out = [{"type": "Feature", "geometry": f["geometry"],
            "properties": {**{k: f["properties"][k] for k in ("name", "type", "moh_type", "owner")},
                           "public": bool(pub), "hub": bool(h)}}
           for f, pub, h in zip(fac, is_public, is_hub)]
hub_pts = [Point(xy) for xy in FXY[is_hub]]
drone_range = unary_union([p.buffer(D.DELIVERY_RADIUS_KM * 1000, 64) for p in hub_pts]) if hub_pts else None

write("district", [feat(district, {"name": "Blantyre District & City"})])
write("ta", ta_out); write("hex", hex_out); write("sites", site_out); write("facilities", fac_out)
write("drone_range", [feat(drone_range, {"radius_km": D.DELIVERY_RADIUS_KM})] if drone_range else [])

S = [f["properties"] for f in site_out]

# ---------- best second hub ----------
# Which public hospital or health centre would bring the most uncovered priority-site people into range?
gap = [(np.array(f["geometry"]["coordinates"]), f["properties"]) for f in site_out
       if f["properties"]["no_regular_health"] and f["properties"]["foot_only"] and not f["properties"]["in_drone_range"]]
best = None
for k, f in enumerate(fac):
    if not is_public[k] or is_hub[k] or f["properties"]["type"] not in ("hospital", "health_centre"): continue
    reach = [p for xy, p in gap if np.hypot(*(xy - FXY[k])) <= D.DELIVERY_RADIUS_KM * 1000]
    score = sum(p["people"] for p in reach)
    if score and (best is None or score > best[0]): best = (score, len(reach), k)
second_hub = None
if best:
    second_hub = {"name": fac[best[2]]["properties"]["name"], "type": fac[best[2]]["properties"]["moh_type"],
                  "people": best[0], "sites": best[1]}
    write("second_hub", [{"type": "Feature", "geometry": fac[best[2]]["geometry"], "properties": second_hub}])
    write("second_range", [feat(Point(FXY[best[2]]).buffer(D.DELIVERY_RADIUS_KM * 1000, 64), {})])
people = lambda rows: sum(r["people"] for r in rows)
tts = [t for t in tt if t is not None]
stats = {
    "population": round(total),
    "facilities": int(sum(dist_p.contains(Point(xy)) for xy in FXY)),
    "public_facilities": int(sum(dist_p.contains(Point(xy)) for xy in FXY[is_public])),
    "pct_gt5_any": share(d_any > 5000), "pct_gt5_pub": share(d_pub > 5000),
    "pct_gt8_pub": share(d_pub > 8000), "pop_gt5_pub": round(POP[d_pub > 5000].sum()),
    "median_tt_min": round(statistics.median(tts), 1) if tts else None,
    "sites": len(S), "displaced": people(S), "under5": sum(r["under5"] for r in S),
    "sites_no_regular_health": sum(r["no_regular_health"] for r in S),
    "people_no_regular_health": people([r for r in S if r["no_regular_health"]]),
    "sites_foot_only": sum(r["foot_only"] for r in S),
    "sites_malaria_top": sum(r["health_problem_1"] == "Malaria" for r in S),
    "sites_gt5_pub": int(sum(r["dist_public_km"] > 5 for r in S)),
    "median_site_dist_pub_km": round(statistics.median(r["dist_public_km"] for r in S), 1),
    "drone_radius_km": D.DELIVERY_RADIUS_KM, "hub_names": D.HUB_NAMES, "hubs": int(is_hub.sum()),
    "pct_pop_in_drone_range": share(d_hub <= D.DELIVERY_RADIUS_KM * 1000),
    "drone_priority_sites": sum(r["drone_priority"] for r in S),
    "drone_priority_people": people([r for r in S if r["drone_priority"]]),
    "drone_priority_under5": sum(r["under5"] for r in S if r["drone_priority"]),
    "sites_in_drone_range": sum(r["in_drone_range"] for r in S),
    "second_hub": second_hub,
    "priority_out_of_range": sum(r["no_regular_health"] and r["foot_only"] and not r["in_drone_range"] for r in S),
}
json.dump(stats, open(ROOT / "data" / "stats.json", "w"), indent=2, default=float)
print(json.dumps(stats, indent=2, default=float))
