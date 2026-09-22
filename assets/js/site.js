'use strict';
// Each visible group shares a clock; shorter clips hold until the group loops.
const groups = [...document.querySelectorAll('[data-group]')];
const states = new Map(groups.map(g => [g, {visible: new Set(), elapsed: 0, last: null}]));
const videos = [...document.querySelectorAll('video[data-src]')];
const MAX_CONCURRENT_VIDEO_LOADS = 2;
const loadQueue = [];
const loadingVideos = new Set();
function pumpLoads() {
  while (loadingVideos.size < MAX_CONCURRENT_VIDEO_LOADS && loadQueue.length) {
    const v = loadQueue.shift();
    if (!isVisible(v) || v.getAttribute('src')) continue;
    loadingVideos.add(v);
    v.poster = v.dataset.poster;
    v.src = v.dataset.src;
    v.load();
  }
}
function releaseLoad(v) { loadingVideos.delete(v); pumpLoads(); }
function unload(v) {
  v.pause();
  const queued = loadQueue.indexOf(v);
  if (queued !== -1) loadQueue.splice(queued, 1);
  if (v.getAttribute('src')) { v.removeAttribute('src'); v.load(); }
  releaseLoad(v);
}
function isVisible(v) {
  return !document.hidden && !!v.getClientRects().length && states.get(v.closest('[data-group]')).visible.has(v);
}
function animateGroup(g, state, now) {
  const active = [...state.visible].filter(isVisible);
  if (!active.some(v => v.readyState >= 2)) { state.last = null; return; }
  if (state.last !== null) state.elapsed += (now - state.last) / 1000;
  state.last = now;
  const loaded = [...g.querySelectorAll('video')].filter(v => Number.isFinite(v.duration));
  const duration = Math.max(0, ...loaded.map(v => v.duration));
  if (!duration) return;
  state.elapsed %= duration;
  active.forEach(v => {
    if (v.readyState < 2 || v.seeking) return;
    const target = Math.min(state.elapsed, Math.max(0, v.duration - .04));
    const hold = state.elapsed >= v.duration - .04;
    if (Math.abs(v.currentTime - target) > .22 || (v.ended && !hold)) v.currentTime = target;
    if (hold) v.pause();
    else if (v.paused) v.play().catch(() => {});
  });
}
const observer = new IntersectionObserver(entries => {
  entries.forEach(({target:v, isIntersecting}) => {
    const state = states.get(v.closest('[data-group]'));
    if (isIntersecting && v.getClientRects().length) {
      state.visible.add(v);
      if (!v.getAttribute('src') && !loadQueue.includes(v)) loadQueue.push(v);
    } else { state.visible.delete(v); unload(v); }
  });
  pumpLoads();
}, {threshold: 0});
videos.forEach(v => {
  v.muted = true;
  v.controls = false;
  const stage = v.closest('.video-stage');
  function loading(pending) {
    stage.classList.toggle('loading', pending);
    stage.setAttribute('aria-busy', String(pending));
  }
  v.addEventListener('loadstart', () => { stage.classList.remove('failed'); loading(true); });
  v.addEventListener('waiting', () => { if (!v.ended) loading(true); });
  v.addEventListener('stalled', () => { if (v.readyState < 3 && !v.ended) loading(true); });
  v.addEventListener('canplay', () => { loading(false); releaseLoad(v); });
  v.addEventListener('playing', () => loading(false));
  v.addEventListener('ended', () => loading(false));
  v.addEventListener('contextmenu', e => e.preventDefault());
  v.addEventListener('play', () => { if (!isVisible(v)) v.pause(); });
  v.addEventListener('error', () => { loading(false); stage.classList.add('failed'); releaseLoad(v); });
  observer.observe(v);
});
setInterval(() => {
  const now = performance.now();
  groups.forEach(g => animateGroup(g, states.get(g), now));
}, 100);
function pauseHidden() { videos.forEach(v => { if (!isVisible(v)) unload(v); }); }
document.addEventListener('visibilitychange', () => {
  states.forEach(state => state.last = null);
  pauseHidden();
  if (!document.hidden) {
    videos.forEach(v => { if (isVisible(v) && !v.getAttribute('src') && !loadQueue.includes(v)) loadQueue.push(v); });
    pumpLoads();
  }
});
document.querySelector('#sequence-select').addEventListener('change', event => {
  document.querySelectorAll('[data-sequence]').forEach(panel => panel.hidden = panel.dataset.sequence !== event.target.value);
  pauseHidden();
});
document.querySelector('#mode-select').addEventListener('change', event => {
  document.querySelectorAll('[data-mode]').forEach(panel => panel.hidden = panel.dataset.mode !== event.target.value);
  pauseHidden();
});
const navObserver = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) document.querySelectorAll('header nav a, .contents-sections a').forEach(a => a.classList.toggle('active', a.hash === '#' + e.target.id)); });
}, {rootMargin: '-15% 0px -65% 0px'});
document.querySelectorAll('main>section[id]').forEach(s => navObserver.observe(s));
