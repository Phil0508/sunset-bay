// Keyboard and mouse. Held keys are polled with down(); one-shot presses (enter car, punch, pause)
// are queued and handed out once with take(), so a press is never lost between frames and never
// counted twice. Mouse movement accumulates until the camera drains it; the pointer is locked on
// click so the camera can turn freely.

export function createInput(canvas) {
  const held = new Set();
  const queued = new Set();
  const mouse = { dx: 0, dy: 0, left: false, right: false, leftQueued: false, wheel: 0 };
  const api = { held, mouse, locked: false, enabled: false };

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab' || e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    if (!held.has(e.code)) queued.add(e.code);
    held.add(e.code);
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', () => {
    held.clear();
    mouse.left = mouse.right = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (!api.enabled) return;
    if (document.pointerLockElement === canvas) {
      mouse.dx += e.movementX;
      mouse.dy += e.movementY;
    }
  });
  window.addEventListener('mousedown', (e) => {
    if (!api.enabled) return;
    if (e.target !== canvas) return;
    if (document.pointerLockElement !== canvas) {
      const p = canvas.requestPointerLock?.();
      if (p?.catch) p.catch(() => {});
    }
    if (e.button === 0) {
      mouse.left = true;
      mouse.leftQueued = true;
    }
    if (e.button === 2) mouse.right = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouse.left = false;
    if (e.button === 2) mouse.right = false;
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('wheel', (e) => {
    mouse.wheel += Math.sign(e.deltaY);
  }, { passive: true });
  document.addEventListener('pointerlockchange', () => {
    api.locked = document.pointerLockElement === canvas;
    api.onLockChange?.(api.locked);
  });

  api.down = (...codes) => codes.some((c) => held.has(c));
  api.take = (...codes) => {
    let hit = false;
    for (const c of codes) if (queued.delete(c)) hit = true;
    return hit;
  };
  api.takeClick = () => {
    const v = mouse.leftQueued;
    mouse.leftQueued = false;
    return v;
  };
  api.drain = () => {
    const d = { dx: mouse.dx, dy: mouse.dy, wheel: mouse.wheel };
    mouse.dx = mouse.dy = mouse.wheel = 0;
    return d;
  };
  api.flush = () => {
    queued.clear();
    mouse.leftQueued = false;
  };
  api.axis = (neg, pos) => (api.down(...pos) ? 1 : 0) - (api.down(...neg) ? 1 : 0);
  return api;
}
