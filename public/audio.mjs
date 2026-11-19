// The user's supplied recordings are kept unchanged. Offsets skip leading silence.
export const SOUND_FILES = { wing: 'wing.mp3', point: 'Flappy_Bird_Point_Sound.ogg', hit: 'hit.mp3', die: 'die.mp3', swoosh: 'swooshing.mp3' };
const OFFSETS = { wing: .015, point: .12, hit: .035, die: 0, swoosh: .025 };
export const DEATH_SOUND_DELAY = .2;

export class GameAudio {
  constructor({ createContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)({ latencyHint: 'interactive' }), fetchAudio = url => fetch(url) } = {}) {
    this.buffers = new Map(); this.sources = new Set(); this.enabled = false;
    try { this.context = createContext(); } catch { return; }
    this.ready = Promise.all(Object.entries(SOUND_FILES).map(async ([name, file]) => {
      try {
        const response = await fetchAudio(`/assets/audio/${file}`);
        if (!response.ok) throw new Error(`Sound unavailable: ${file}`);
        this.buffers.set(name, await this.context.decodeAudioData(await response.arrayBuffer()));
      } catch (error) { console.warn(error); }
    }));
  }
  unlock() {
    this.enabled = true;
    if (this.context?.state === 'suspended') this.context.resume().catch(() => {});
  }
  play(name, delay = 0) {
    const buffer = this.buffers.get(name);
    if (!this.enabled || !this.context || !buffer || this.context.state === 'closed') return;
    const source = this.context.createBufferSource();
    source.buffer = buffer; source.connect(this.context.destination);
    source.onended = () => { this.sources.delete(source); source.disconnect(); };
    this.sources.add(source);
    source.start(this.context.currentTime + delay, OFFSETS[name] || 0);
  }
  stop() {
    for (const source of this.sources) { source.stop(); source.disconnect(); }
    this.sources.clear();
  }
}
