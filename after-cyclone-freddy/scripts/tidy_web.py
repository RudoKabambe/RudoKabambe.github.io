"""Rounding coordinates for the web can collapse tiny rings into lines, which ogr2ogr
then wraps in a GeometryCollection. Keep only the polygon parts of polygon layers."""
import json, sys
from pathlib import Path
for name in sys.argv[1:]:
    p = Path("data") / f"{name}.geojson"; d = json.loads(p.read_text())
    for f in d["features"]:
        g = f["geometry"]
        if g and g["type"] == "GeometryCollection":
            polys = [x for x in g["geometries"] if x["type"] in ("Polygon", "MultiPolygon")]
            coords = [c for x in polys for c in (x["coordinates"] if x["type"] == "MultiPolygon" else [x["coordinates"]])]
            f["geometry"] = {"type": "MultiPolygon", "coordinates": coords}
    p.write_text(json.dumps(d, separators=(",", ":")))
    print("tidied", name)
