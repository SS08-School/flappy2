// Timings measured from youtube.com/watch?v=8nJhk_u4krI (v1.3 reference).
export const TRANSITION_TIMING = {
  sceneOut: .35, sceneHold: .1, sceneIn: .35,
  readyIn: .5, readyOut: .5,
  headerDelay: .55, headerIn: .3,
  panelDelay: 1.55, panelIn: .4,
  countDelay: 2.55, countStep: .025, countMax: .8,
  replayIn: .12, medalIn: .2,
};
const clamp = value => Math.max(0, Math.min(1, value));
export const transitionEase = value => 1 - (1 - clamp(value)) ** 3;

export function resultPresentation(elapsed, score = 0, reducedMotion = false) {
  const t = TRANSITION_TIMING;
  const header = reducedMotion ? 1 : clamp((elapsed - t.headerDelay) / t.headerIn);
  const card = reducedMotion ? 1 : clamp((elapsed - t.panelDelay) / t.panelIn);
  const countDuration = Math.max(t.countStep, Math.min(score * t.countStep, t.countMax));
  const countProgress = reducedMotion ? 1 : clamp((elapsed - t.countDelay) / countDuration);
  const doneAt = t.countDelay + (score ? countDuration : 0);
  const finished = reducedMotion || elapsed >= doneAt;
  const buttons = reducedMotion ? 1 : clamp((elapsed - doneAt) / t.replayIn);
  const medal = reducedMotion ? 1 : clamp((elapsed - doneAt) / t.medalIn);
  return {
    headerOpacity: header, headerY: 6 * (1 - header),
    cardVisible: reducedMotion || elapsed >= t.panelDelay,
    cardY: 254 * (1 - transitionEase(card)),
    displayScore: countProgress === 1 ? score : Math.floor(score * countProgress),
    finished, finishedAt: doneAt, replayOpacity: buttons,
    medalOpacity: medal, medalScale: 1 + .25 * (1 - transitionEase(medal)),
  };
}
