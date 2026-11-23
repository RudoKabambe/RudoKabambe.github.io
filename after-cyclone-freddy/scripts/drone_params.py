"""Drone network settings for the "where could drones close the gap?" section.

Rudo's operational decisions as remote pilot (set 23 Nov 2026).
The analysis (scripts/analyse.py) reads them and the web map shows them.
"""

# Drone hubs, named exactly as in the MoH Health Facility Registry.
# One central hub mirrors how real medical drone programmes start: one site with
# cold-chain storage, trained pilots and lab capacity, not every clinic.
HUB_NAMES = ["Queen Elizabeth Central Hospital"]

# One-way delivery radius in km from a hub. 20 km leaves margin for the return
# leg, a battery reserve, a cool-box payload and Blantyre's hills and wind.
DELIVERY_RADIUS_KM = 20

# A site is a drone priority when it had no regular health service on site
# AND vehicles could not reach it (foot, bicycle or motorbike only).
# Drones add value where road transport can't get through, so access is key.
def is_drone_priority(site):
    return site["no_regular_health"] and site["foot_only"]
