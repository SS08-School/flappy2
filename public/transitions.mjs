// Presentation timings referenced from nebez/floppybird's screen transitions.
// This Canvas implementation does not import its code, assets, or libraries.
export const TRANSITION_TIMING = {
  splashIn: 2,
  splashOut: .5,
  resultsIn: .6,
  replayIn: .6,
  medalIn: 1.2,
  resultsOut: 1,
};

const clamp = value => Math.max(0, Math.min(1, value));
const bezier = (t, a, b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3;

// CSS 'ease': cubic-bezier(.25, .1, .25, 1).
export function transitionEase(progress) {
  const x = clamp(progress);
  if (x === 0 || x === 1) return x;
  let low = 0, high = 1;
  for (let i = 0; i < 18; i++) {
    const middle = (low + high) / 2;
    if (bezier(middle, .25, .25) < x) low = middle;
    else high = middle;
  }
  return bezier((low + high) / 2, .1, 1);
}

export function resultPresentation(elapsed, exitElapsed = null, reducedMotion = false) {
  const card = reducedMotion ? 1 : transitionEase(elapsed / TRANSITION_TIMING.resultsIn);
  const replay = reducedMotion ? 1 : transitionEase((elapsed - TRANSITION_TIMING.resultsIn) / TRANSITION_TIMING.replayIn);
  const medal = reducedMotion ? 1 : transitionEase((elapsed - TRANSITION_TIMING.resultsIn) / TRANSITION_TIMING.medalIn);
  const exit = exitElapsed === null ? 0 : reducedMotion ? 1 : transitionEase(exitElapsed / TRANSITION_TIMING.resultsOut);
  const y = 40 * (1 - card) - 40 * exit;
  return {
    cardOpacity: card * (1 - exit), cardY: y,
    replayOpacity: card * replay * (1 - exit), replayY: y + 40 * (1 - replay),
    medalOpacity: medal, medalScale: 2 - medal,
  };
}
