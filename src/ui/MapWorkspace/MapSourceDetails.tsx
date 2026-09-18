import type { TranslationKey } from "../../i18n";
import "./MapSourceDetails.css";

export function MapSourceDetails({ floating = false, search = false, t }: { floating?: boolean; search?: boolean; t: (key: TranslationKey) => string }) {
  return <details className={`map-source-details${floating ? " osm-map-attribution" : ""}`}>
    <summary>{t("map.sourceDetails")}</summary>
    <div className="map-source-content">
      <p>© OpenStreetMap contributors</p>
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">{t("map.sourceLicense")}</a>
      {search && <p>{t("osm.search")}: <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon / komoot</a></p>}
    </div>
  </details>;
}
