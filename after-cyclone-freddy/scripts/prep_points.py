"""Prepare the two point layers for the Freddy x health access story.

Inputs (data_hunt/):  mhfr/mhfr.csv  (MoH Health Facility Registry, Feb 2023)
                      dtm_freddy.xlsx (IOM DTM Site Assessment R1, Cyclone Freddy)
Outputs (webgis/raw/): facilities_mhfr.geojson (all Malawi facilities with valid coords)
                       sites_freddy.geojson    (Blantyre displacement sites)
"""
import csv, json, openpyxl
from collections import Counter
from pathlib import Path
HUNT = Path(__file__).resolve().parents[2] / "data_hunt"
RAW = Path(__file__).resolve().parents[1] / "raw"; RAW.mkdir(exist_ok=True)

def fc(features): return {"type": "FeatureCollection", "features": features}
def pt(lon, lat, props): return {"type": "Feature", "geometry": {"type": "Point", "coordinates": [round(lon, 6), round(lat, 6)]}, "properties": props}

# ---- MoH facilities ----
TYPE = {"Central Hospital": "hospital", "District Hospital": "hospital", "Hospital": "hospital",
        "Health Centre": "health_centre", "Dispensary": "health_post", "Health Post": "health_post", "Clinic": "clinic"}
fac, bad = [], 0
for r in csv.DictReader(open(HUNT / "mhfr" / "mhfr.csv", encoding="utf-8", errors="replace")):
    lat, lon = float(r["LATITUDE"] or 0), float(r["LONGITUDE"] or 0)
    if not (-17.2 < lat < -9.3 and 32.6 < lon < 36.0):   # outside Malawi or missing
        bad += 1; continue
    fac.append(pt(lon, lat, {"name": r["NAME"].strip().title(), "type": TYPE.get(r["TYPE"], "clinic"),
                             "moh_type": r["TYPE"], "owner": r["OWNERSHIP"], "status": r["STATUS"],
                             "district": r["DISTRICT"], "code": r["CODE"]}))
json.dump(fc(fac), open(RAW / "facilities_mhfr.geojson", "w"))
print(f"MHFR: {len(fac)} facilities with valid coords, {bad} skipped")
print("  national status:", Counter(f["properties"]["status"] for f in fac))

# ---- IOM DTM displacement sites ----
ws = openpyxl.load_workbook(HUNT / "dtm_freddy.xlsx", read_only=True, data_only=True)["MSLA_data"]
rows = list(ws.iter_rows(values_only=True))
hi = next(i for i, r in enumerate(rows[:10]) if r and "Latitude" in r)
H = rows[hi]; col = {h: i for i, h in enumerate(H) if h}
def g(r, name):
    v = r[col[name]] if name in col else None
    return v.strip() if isinstance(v, str) else v
def num(v): return int(v) if isinstance(v, (int, float)) else 0
sites = []
for r in rows[hi + 1:]:
    if not r or "Blantyre" not in str(g(r, "District (Admin 2)")): continue
    lat, lon = g(r, "Latitude"), g(r, "Longitude")
    if not isinstance(lat, (int, float)) or lat > -14: continue
    reasons = [k for k in ("Floods", "Land slide", "Strong Winds") if str(g(r, f"Reasons for displacement/{k}")) in ("1", "True", "Yes")]
    sites.append(pt(lon, lat, {
        "name": (g(r, "Site Name") or "Unnamed site").title(), "ta": g(r, "Site Location for T/A"),
        "people": num(g(r, "What is the total individuals IDP persons currently staying at the site")),
        "households": num(g(r, "Total number of IDP Families/HHs currently at the Site")),
        "under5": num(g(r, "Total Children (1-5 yrs)")) + num(g(r, "Total Infant (Less than 1 yrs)")),
        "health_on_site": g(r, "Presence of health service at the site"),
        "health_visits": g(r, "How frequent does the site gets visited by health personel"),
        "health_problem_1": g(r, "Most Prevalent health problems/1st choice"),
        "health_problem_2": g(r, "Most Prevalent health problems/2nd choice"),
        "structure": g(r, "Site Type"), "terrain": g(r, "Geographic terrain of the site"),
        "access": g(r, "How can the site be accessed"), "reasons": ", ".join(reasons) or (g(r, "Reasons for displacement") or ""),
        "survey_date": str(g(r, "Date of the survey") or "")[:10],
    }))
json.dump(fc(sites), open(RAW / "sites_freddy.geojson", "w"))
P = [s["properties"] for s in sites]
print(f"DTM: {len(sites)} Blantyre sites, {sum(p['people'] for p in P)} people, {sum(p['under5'] for p in P)} under-5")
for k in ("health_on_site", "health_visits", "health_problem_1", "reasons", "access"):
    print(f"  {k}:", Counter(p[k] for p in P).most_common(6))
