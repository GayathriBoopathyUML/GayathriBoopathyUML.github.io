/*
 * Research-themed animated background
 * - MediaPipe-style 21-landmark hand skeletons that cycle through gestures
 *   (open, fist, pinch, point, flexion/extension)
 * - AR-style tracking brackets with confidence labels around each hand
 * - A wandering eye-gaze reticle with a fading fixation trail
 * - A faint spatial-computing grid
 * Respects prefers-reduced-motion (draws a single still frame).
 */
(() => {
  const canvas = document.getElementById("bg");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0, H = 0, DPR = 1, accent = "#6b3fa0", ink = "#1d1b22";

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    accent = cs.getPropertyValue("--accent").trim() || accent;
    ink = cs.getPropertyValue("--muted").trim() || ink;
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    layoutHands();
  }

  /* ---------- Hand model (MediaPipe landmark order) ----------
     0 wrist | 1-4 thumb | 5-8 index | 9-12 middle | 13-16 ring | 17-20 pinky */
  const FINGERS = [
    { base: [-0.32, -0.18], angle: -2.25, len: [0.30, 0.26, 0.22] }, // thumb (from CMC)
    { base: [-0.20, -0.62], angle: -1.72, len: [0.30, 0.20, 0.16] }, // index
    { base: [ 0.00, -0.66], angle: -1.57, len: [0.33, 0.22, 0.17] }, // middle
    { base: [ 0.18, -0.62], angle: -1.42, len: [0.30, 0.20, 0.16] }, // ring
    { base: [ 0.33, -0.52], angle: -1.25, len: [0.24, 0.16, 0.14] }, // pinky
  ];
  const BONES = [
    [0,1],[1,2],[2,3],[3,4],
    [0,5],[5,6],[6,7],[7,8],
    [5,9],[9,10],[10,11],[11,12],
    [9,13],[13,14],[14,15],[15,16],
    [13,17],[0,17],[17,18],[18,19],[19,20],
  ];
  // Gestures = curl amount per finger [thumb, index, middle, ring, pinky]
  const GESTURES = {
    open:  [0.0, 0.0, 0.0, 0.0, 0.0],
    fist:  [0.9, 1.0, 1.0, 1.0, 1.0],
    point: [0.8, 0.0, 1.0, 1.0, 1.0],
    peace: [0.8, 0.0, 0.0, 1.0, 1.0],
    pinch: [0.55, 0.55, 0.1, 0.1, 0.1],
    flex:  [0.3, 0.5, 0.5, 0.5, 0.5],
  };
  const SEQ = ["open", "fist", "open", "point", "peace", "open", "pinch", "flex"];

  function landmarks(curl) {
    const pts = [[0, 0]];
    FINGERS.forEach((f, i) => {
      let [x, y] = f.base;
      if (i === 0) { // thumb has CMC at its base
        pts.push([x, y]);
      } else {
        pts.push([x, y]);
      }
      let a = f.angle;
      const c = curl[i];
      const bend = i === 0 ? [0.5, 0.6, 0.5] : [1.1, 1.5, 1.0];
      const dir = i === 0 ? 1 : 1;
      for (let j = 0; j < 3; j++) {
        if (i === 0 && j === 2) break; // thumb only has 4 points total
        a += dir * c * bend[j];
        x += Math.cos(a) * f.len[j];
        y += Math.sin(a) * f.len[j];
        pts.push([x, y]);
      }
      if (i === 0) {
        a += c * bend[2];
        x += Math.cos(a) * f.len[2];
        y += Math.sin(a) * f.len[2];
        pts.push([x, y]);
      }
    });
    return pts.slice(0, 21);
  }

  const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

  let hands = [];
  function layoutHands() {
    const small = W < 700;
    const s = small ? 0.75 : 1;
    hands = [
      { x: 0.80, y: 0.32, size: 150 * s, rot: 0.18, mirror: 1, phase: 0.0, conf: 0.97 },
      { x: 0.16, y: 0.72, size: 120 * s, rot: -0.35, mirror: -1, phase: 2.7, conf: 0.94 },
      { x: 0.62, y: 0.86, size: 95 * s, rot: 0.6, mirror: 1, phase: 5.1, conf: 0.91 },
    ];
    if (small) hands = hands.slice(0, 2);
  }

  function handPose(h, t) {
    const period = 2.6; // seconds per gesture
    const tt = t / period + h.phase;
    const n = SEQ.length;
    const i = ((Math.floor(tt) % n) + n) % n;
    const f = tt - Math.floor(tt);
    const hold = Math.min(1, Math.max(0, (f - 0.35) / 0.65)); // hold then transition
    const curl = mix(GESTURES[SEQ[i]], GESTURES[SEQ[(i + 1) % n]], ease(hold));
    const cx = h.x * W + Math.sin(t * 0.21 + h.phase) * 26;
    const cy = h.y * H + Math.cos(t * 0.17 + h.phase) * 20;
    const rot = h.rot + Math.sin(t * 0.3 + h.phase) * 0.12;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const pts = landmarks(curl).map(([x, y]) => {
      x *= h.mirror * h.size; y *= h.size;
      return [cx + x * cos - y * sin, cy + x * sin + y * cos];
    });
    return { pts, label: SEQ[i] };
  }

  function rgba(hex, a) {
    const m = hex.replace("#", "");
    const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  function drawGrid(t) {
    const step = 64;
    const off = reduceMotion ? 0 : (t * 6) % step;
    ctx.strokeStyle = rgba(accent, 0.05);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = -step + off; x < W + step; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = -step + off; y < H + step; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
  }

  function drawHand({ pts, label }, h) {
    ctx.lineCap = "round";
    ctx.strokeStyle = rgba(accent, 0.28);
    ctx.lineWidth = 2;
    ctx.beginPath();
    BONES.forEach(([a, b]) => { ctx.moveTo(...pts[a]); ctx.lineTo(...pts[b]); });
    ctx.stroke();

    pts.forEach(([x, y], i) => {
      const tip = [4, 8, 12, 16, 20].includes(i);
      ctx.fillStyle = rgba(accent, tip ? 0.55 : 0.38);
      ctx.beginPath();
      ctx.arc(x, y, tip ? 3.6 : 2.6, 0, Math.PI * 2);
      ctx.fill();
    });

    // AR tracking brackets
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pts.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
    const pad = 14, c = 12;
    x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
    ctx.strokeStyle = rgba(accent, 0.3);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]].forEach(([x, y, dx, dy]) => {
      ctx.moveTo(x + dx * c, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * c);
    });
    ctx.stroke();
    ctx.fillStyle = rgba(accent, 0.45);
    ctx.font = "500 10px Inter, system-ui, sans-serif";
    ctx.fillText(`hand · ${label} · ${h.conf.toFixed(2)}`, x0, y0 - 6);
  }

  // Eye-gaze reticle + fixation trail
  const trail = [];
  function drawGaze(t) {
    const gx = W * (0.5 + 0.38 * Math.sin(t * 0.23) * Math.cos(t * 0.07));
    const gy = H * (0.5 + 0.32 * Math.sin(t * 0.31 + 1.3));
    if (!reduceMotion) {
      trail.push([gx, gy]);
      if (trail.length > 70) trail.shift();
    }
    ctx.lineWidth = 1.2;
    for (let i = 1; i < trail.length; i++) {
      ctx.strokeStyle = rgba(ink, (i / trail.length) * 0.16);
      ctx.beginPath(); ctx.moveTo(...trail[i - 1]); ctx.lineTo(...trail[i]); ctx.stroke();
    }
    const r = 16 + Math.sin(t * 2.2) * 2;
    ctx.strokeStyle = rgba(ink, 0.32);
    ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(gx, gy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(gx, gy, 3, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(gx - r - 7, gy); ctx.lineTo(gx - r + 4, gy);
    ctx.moveTo(gx + r - 4, gy); ctx.lineTo(gx + r + 7, gy);
    ctx.moveTo(gx, gy - r - 7); ctx.lineTo(gx, gy - r + 4);
    ctx.moveTo(gx, gy + r - 4); ctx.lineTo(gx, gy + r + 7);
    ctx.stroke();
    ctx.fillStyle = rgba(ink, 0.4);
    ctx.font = "500 10px Inter, system-ui, sans-serif";
    ctx.fillText("gaze", gx + r + 10, gy - r);
  }

  const start = performance.now();
  let last = 0;
  function frame(now) {
    if (now - last > 33) { // ~30 fps is plenty for a background
      last = now;
      const t = Math.max(0, (now - start) / 1000);
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = W < 700 ? 0.5 : 1; // keep text readable on phones
      drawGrid(t);
      hands.forEach((h) => drawHand(handPose(h, t), h));
      drawGaze(t);
    }
    if (!reduceMotion) requestAnimationFrame(frame);
  }

  readColors();
  resize();
  window.addEventListener("resize", resize);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", readColors);
  requestAnimationFrame(frame);
})();
