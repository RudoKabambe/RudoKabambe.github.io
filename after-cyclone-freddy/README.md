# After Cyclone Freddy — Blantyre health access & drone reach

An interactive webGIS story. In March 2023, Cyclone Freddy displaced 19,426 people into 97 sites across Blantyre, Malawi. This map asks two questions: could those families reach health care, and where could medical drones close the gap?

**Author:** Rudo Mutetwa Kabambe, GIS Analyst & Remote Pilot (525+ BVLOS/VLOS medical delivery flight hours in Malawi)

## Story chapters
1. **Storm:** displacement sites from the IOM Displacement Tracking Matrix
2. **Network:** Ministry of Health registered facilities, public versus private
3. **Distance:** population (400 m hexagons) shaded by distance to the nearest public facility
4. **Sites:** displacement sites with no regular health service or foot-only access
5. **Drones:** one hub at QECH (20 km) and the 26 priority sites (no regular health service + foot-only access)
6. **Next hub:** the best second hub to reach the priority sites still uncovered
7. **Explore:** click anywhere to measure distance to the nearest public facility

## Key results
| | |
|---|---|
| Population (Kontur 2023) | 1,476,681 |
| Registered facilities / public | 146 / 28 |
| People > 5 km from a public facility | 129,122 (8.7%) |
| Median motorised travel time to care | 26.4 min |
| Displacement sites with no regular health service | 45 sites, 8,858 people |
| Sites reachable only on foot / bicycle / motorbike | 68 of 97 |

## Data
| Layer | Source | Licence |
|---|---|---|
| Health facilities | Malawi MoH Health Facility Registry (Feb 2023), via HDX | per HDX |
| Displacement sites | IOM DTM Site Assessment R1, Cyclone Freddy, via HDX | per HDX |
| Population | Kontur Population H3 400 m (Nov 2023) | CC BY 4.0 |
| Motorised travel time | CPAS, Data for Children Collaborative (100 m) | CC BY 4.0 |
| Boundaries | OCHA COD-AB Malawi v02 | CC BY-IGO |
| Basemaps | Esri, OpenStreetMap | as attributed |

## Method
Every input is projected to WGS 84 / UTM 36S. For each population hexagon and displacement site, the scripts compute the nearest facility, the nearest *public* facility (government or CHAM hospital, health centre or health post), and the nearest drone hub, then sample the travel-time raster. Facilities up to 15 km outside the district are included because residents cross district lines for care. The drone parameters (hub types, delivery radius, priority rule) live in `scripts/drone_params.py`.

## Limitations
- Distances are straight-line; travel time comes from a modelled raster.
- The registry's "functional" status field looks outdated (1,121 of 1,328 facilities nationally are marked non-functional), so all registered facilities are included. 44 Blantyre records have no coordinates.
- Displacement data is a single survey round.

## Rebuild
Raw downloads go in `../data_hunt/` (see `DATA_SOURCES.md`). Then run:
```
bash scripts/build.sh
```
Run the app locally with `python -m http.server 8000` and open http://localhost:8000.
