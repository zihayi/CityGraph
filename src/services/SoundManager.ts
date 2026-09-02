import clickUrl from "../../assets/click.wav?url";
import acousticGuitarUrl from "../../assets/music/viacheslavstarostin-acoustic-guitar-music-467793.mp3?url";
import jazzCafeUrl from "../../assets/music/aurectheme-jazz-cafe-585969.mp3?url";
import pianoUrl from "../../assets/music/andriih-piano-piano-background-590657.mp3?url";
import lofiCoffeeUrl from "../../assets/music/alex-morgan-lofi-jazz-retro-coffee-shop-560042.mp3?url";
import sunnyCafeUrl from "../../assets/music/alex-morgan-jazz-song-sunny-cafe-nu-jazz-587413.mp3?url";
import guitarSunriseUrl from "../../assets/music/alex-morgan-acoustic-guitar-sunrise-travel-573651.mp3?url";
import lofiJazzUrl from "../../assets/music/zephiramusic-lofi-jazz-582886.mp3?url";

const musicTracks = [lofiJazzUrl, acousticGuitarUrl, jazzCafeUrl, pianoUrl, lofiCoffeeUrl, sunnyCafeUrl, guitarSunriseUrl];

class SoundManager {
  private readonly clickAudio = new Audio(clickUrl);
  private readonly musicAudio = new Audio();
  private clickContext?: AudioContext;
  private clickBuffer?: AudioBuffer;
  private lastPlayedAt = 0;
  private musicIndex = 0;
  private musicEnabled = false;
  private unlockArmed = false;

  public constructor() {
    this.clickAudio.preload = "auto";
    this.clickAudio.load();
    if (typeof AudioContext !== "undefined") {
      this.clickContext = new AudioContext({ latencyHint: "interactive" });
      void fetch(clickUrl)
        .then((response) => response.arrayBuffer())
        .then((data) => this.clickContext?.decodeAudioData(data))
        .then((buffer) => { this.clickBuffer = buffer; })
        .catch(() => { this.clickContext = undefined; });
    }
    this.musicAudio.preload = "auto";
    this.musicAudio.src = musicTracks[this.musicIndex]!;
    this.musicAudio.addEventListener("ended", () => { this.musicIndex = (this.musicIndex + 1) % musicTracks.length; this.musicAudio.src = musicTracks[this.musicIndex]!; this.tryPlayMusic(); });
  }

  public playClick(): void {
    const now = performance.now();
    if (now - this.lastPlayedAt < 70) return;
    this.lastPlayedAt = now;
    if (this.clickContext && this.clickBuffer) {
      if (this.clickContext.state === "suspended") void this.clickContext.resume();
      const source = this.clickContext.createBufferSource();
      source.buffer = this.clickBuffer;
      source.connect(this.clickContext.destination);
      source.start();
      return;
    }
    this.clickAudio.pause();
    this.clickAudio.currentTime = 0;
    void this.clickAudio.play().catch(() => undefined);
  }

  public configureMusic(enabled: boolean, volume: number): void {
    this.musicEnabled = enabled;
    this.musicAudio.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.28;
    if (enabled) this.tryPlayMusic(); else { this.musicAudio.pause(); this.disarmUnlock(); }
  }

  private tryPlayMusic(): void {
    if (!this.musicEnabled) return;
    void this.musicAudio.play().then(() => this.disarmUnlock()).catch(() => this.armUnlock());
  }
  private armUnlock(): void {
    if (this.unlockArmed || typeof window === "undefined") return;
    this.unlockArmed = true; window.addEventListener("pointerdown", this.unlockMusic, { once: true }); window.addEventListener("keydown", this.unlockMusic, { once: true });
  }
  private disarmUnlock(): void {
    if (!this.unlockArmed || typeof window === "undefined") return;
    this.unlockArmed = false; window.removeEventListener("pointerdown", this.unlockMusic); window.removeEventListener("keydown", this.unlockMusic);
  }
  private unlockMusic = (): void => { this.disarmUnlock(); this.tryPlayMusic(); };
}

export const soundManager = new SoundManager();
