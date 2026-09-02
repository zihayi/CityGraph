import { useEffect, useState } from "react";
import logoUrl from "../../../assets/logo.png?url";

export function LaunchScreen() {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setLeaving(true), 3400);
    const dismiss = (event: KeyboardEvent) => { event.preventDefault(); event.stopImmediatePropagation(); setLeaving(true); };
    window.addEventListener("keydown", dismiss, { capture: true });
    return () => { window.clearTimeout(timer); window.removeEventListener("keydown", dismiss, { capture: true }); };
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setVisible(false), 650);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  if (!visible) return null;
  return <div className={`launch-screen${leaving ? " is-leaving" : ""}`} aria-label="CityGraph" onPointerDown={() => setLeaving(true)}>
    <div className="launch-grid"/>
    <svg className="launch-routes" viewBox="0 0 1200 700" preserveAspectRatio="none" aria-hidden="true">
      <path d="M-80 570 C170 540 235 410 455 444 S720 590 840 430 1020 180 1280 230"/>
      <path d="M180 -80 C220 140 370 170 350 350 S230 610 330 780"/>
      <path d="M760 -60 C720 130 810 220 990 300 S1210 390 1270 560"/>
      <circle cx="455" cy="444" r="7"/><circle cx="840" cy="430" r="7"/><circle cx="350" cy="350" r="7"/><circle cx="990" cy="300" r="7"/>
    </svg>
    <div className="launch-content">
      <div className="launch-logo-wrap"><span/><img src={logoUrl} alt=""/></div>
      <div className="launch-wordmark">
        <h1><span>City</span><span>Graph</span></h1>
        <i/>
        <p>A game by <strong>Toria</strong></p>
      </div>
    </div>
  </div>;
}
