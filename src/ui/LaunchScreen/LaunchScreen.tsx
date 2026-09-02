import { useEffect, useRef, useState } from "react";
import logoUrl from "../../../assets/logo.png?url";

export function LaunchScreen({ onComplete }: { onComplete: () => void }) {
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setLeaving(true), 2800);
    const dismiss = (event: KeyboardEvent) => { event.preventDefault(); event.stopImmediatePropagation(); setLeaving(true); };
    window.addEventListener("keydown", dismiss, { capture: true });
    return () => { window.clearTimeout(timer); window.removeEventListener("keydown", dismiss, { capture: true }); };
  }, [visible]);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => { setVisible(false); onCompleteRef.current(); }, 500);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  if (!visible) return null;
  return <div className={`launch-screen${leaving ? " is-leaving" : ""}`} aria-label="CityGraph" onPointerDown={() => setLeaving(true)}>
    <div className="launch-content">
      <img className="launch-logo" src={logoUrl} alt=""/>
      <div className="launch-wordmark">
        <h1>CityGraph</h1>
        <p>A game by <strong>Toria</strong></p>
      </div>
    </div>
  </div>;
}
