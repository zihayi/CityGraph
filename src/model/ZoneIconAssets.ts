import bookRaw from "../../assets/zone/book-open-text.svg?raw";
import briefcaseRaw from "../../assets/zone/briefcase.svg?raw";
import officeRaw from "../../assets/zone/building-office.svg?raw";
import coffeeRaw from "../../assets/zone/coffee.svg?raw";
import factoryRaw from "../../assets/zone/factory.svg?raw";
import medicalRaw from "../../assets/zone/first-aid.svg?raw";
import foodRaw from "../../assets/zone/fork-knife.svg?raw";
import educationRaw from "../../assets/zone/graduation-cap.svg?raw";
import houseRaw from "../../assets/zone/house-line.svg?raw";
import parkingRaw from "../../assets/zone/letter-circle-p.svg?raw";
import parkRaw from "../../assets/zone/park.svg?raw";
import commercialRaw from "../../assets/zone/shopping-bag-open.svg?raw";

const zoneIconRaw: Record<string, string> = { "book-open-text": bookRaw, briefcase: briefcaseRaw, "building-office": officeRaw, coffee: coffeeRaw, factory: factoryRaw, "first-aid": medicalRaw, "fork-knife": foodRaw, "graduation-cap": educationRaw, "house-line": houseRaw, "letter-circle-p": parkingRaw, park: parkRaw, "shopping-bag-open": commercialRaw };

export function zoneIconPath(icon: string): string {
  return (zoneIconRaw[icon] ?? zoneIconRaw["letter-circle-p"]!).match(/<path\s+d="([^"]+)"/)?.[1] ?? "";
}
