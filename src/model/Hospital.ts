import type { Hospital, Zone } from "./City";

/** Keep one main campus as the hospital's university-affiliation representative. */
export function normalizeHospitalCampuses(hospitals: readonly Hospital[], source: readonly Zone[]): Zone[] {
  const hospitalsById = new Map(hospitals.map((hospital) => [hospital.id, hospital]));
  const mainCampuses = new Map<string, Zone>();
  for (const zone of source) {
    if (!zone.hospitalId || !hospitalsById.has(zone.hospitalId)) continue;
    const main = mainCampuses.get(zone.hospitalId);
    if (!main || main.hospitalCampusRole !== "main" && zone.hospitalCampusRole === "main") mainCampuses.set(zone.hospitalId, zone);
  }
  return source.map((zone) => {
    const hospital = zone.hospitalId ? hospitalsById.get(zone.hospitalId) : undefined;
    if (!hospital) return zone;
    const isMain = zone.id === mainCampuses.get(hospital.id)?.id;
    const hospitalCampusRole = isMain ? "main" : "branch";
    const affiliatedUniversityId = isMain ? hospital.affiliatedUniversityId : undefined;
    if (zone.hospitalCampusRole === hospitalCampusRole && zone.affiliatedUniversityId === affiliatedUniversityId) return zone;
    return { ...zone, hospitalCampusRole, affiliatedUniversityId };
  });
}
