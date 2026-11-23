// access.js — how the map rates a location's access to health care.
//
// When someone clicks the map, app.js finds the nearest PUBLIC facility
// (government or CHAM hospital, health centre or health post, free at point of care)
// and calls rateAccess() with the straight-line distance. The label and colour you
// return are shown in the side panel and on the line drawn to the facility.
//
// Inputs:
//   distanceKm    straight-line distance to the nearest public facility, in km
//   facilityType  "hospital" | "health_centre" | "health_post"  (type of that facility)
//
// Return an object: { label: "Good access", color: "#2E8B57" }
//
// Things to decide:
//   - Malawi's Ministry of Health target is everyone within 8 km of a facility.
//     Where do you draw the lines between good / limited / poor?
//   - Straight-line distance underestimates real travel on Blantyre's roads and
//     hills. Should your thresholds be stricter to allow for that?
//   - Should the nearest facility being a clinic (not a hospital) change the rating?

function rateAccess(distanceKm, facilityType) {
  // TODO (Rudo): replace this placeholder with your own rating rules.
  return { label: "Not rated yet", color: "#6B7B80" };
}
