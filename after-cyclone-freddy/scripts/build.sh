#!/usr/bin/env bash
# Rebuild every web layer for "After Freddy" from the raw downloads in ../data_hunt.
# Run from Git Bash:  bash scripts/build.sh
set -euo pipefail
Q="/c/Program Files/QGIS 3.34.15"
export GDAL_DATA="$Q/apps/gdal/share/gdal" PROJ_LIB="$Q/share/proj"
OGR="$Q/bin/ogr2ogr.exe"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
HUNT=../data_hunt; GDB="$HUNT/codab/mwi_admin_boundaries.gdb"; UTM=EPSG:32736
mkdir -p raw data

python scripts/prep_points.py

utm() { rm -f "raw/utm_$1.geojson"; "$OGR" -f GeoJSON "raw/utm_$1.geojson" "${@:2}" -t_srs $UTM -lco COORDINATE_PRECISION=1; }
utm adm2 "$GDB" -sql "SELECT * FROM mwi_admin2 WHERE adm2_pcode IN ('MW305','MW315')"
utm adm3 "$GDB" -sql "SELECT adm3_name, adm3_pcode FROM mwi_admin3 WHERE adm2_pcode IN ('MW305','MW315')"
utm facilities raw/facilities_mhfr.geojson
utm sites raw/sites_freddy.geojson
utm hex "$HUNT/kontur_pop.gpkg" population -spat 34.55 -16.2 35.3 -15.2 -spat_srs EPSG:4326

(cd scripts && python analyse.py)

web() { rm -f "data/$2.geojson"; "$OGR" -f GeoJSON "data/$2.geojson" "raw/out_$1.geojson" -s_srs $UTM -t_srs EPSG:4326 \
        -lco COORDINATE_PRECISION=${3:-5} -lco RFC7946=YES ${4:-}; }
web district district
web ta ta 5 "-simplify 30"
web hex hex 5
web sites sites 6
web facilities facilities 6
web drone_range drone_range 4 "-simplify 50"
web second_hub second_hub 6
web second_range second_range 4 "-simplify 50"
python scripts/tidy_web.py district ta hex drone_range second_range
ls -la data
