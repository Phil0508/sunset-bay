// The heads-up display, plain DOM over the canvas: money, wanted stars, clock, health, ammo,
// speedometer, mission objective with distance, enter/exit prompts, toasts, Rosa's subtitles,
// mission banners, the arrest meter and the red hurt flash. Values are only written when they
// change, so the HUD costs next to nothing per frame.
import { formatClock, dist } from './util.js';

export function createHud(game) {
  const $ = (id) => document.getElementById(id);
  const el = {
    root: $('hud'), money: $('money'), stars: $('stars'), clock: $('clock'), hp: $('hp'), ammo: $('ammo'),
    speedo: $('speedo'), kmh: $('kmh'), carname: $('carname'), carhp: $('carhp'), crosshair: $('crosshair'),
    prompt: $('prompt'), bust: $('bust'), toasts: $('toasts'), subtitle: $('subtitle'), objective: $('objective'),
    objText: $('obj-text'), objDist: $('obj-dist'), hint: $('hint'), banner: $('banner'), hurt: $('hurt'),
  };
  const starEls = Array.from(el.stars.children);
  const last = {};
  const set = (key, node, value, prop = 'textContent') => {
    if (last[key] === value) return;
    last[key] = value;
    node[prop] = value;
  };

  const api = {};
  const subs = [];
  let hintUntil = 0;
  let bannerUntil = 0;
  const now = () => performance.now() / 1000;

  api.show = () => { el.root.hidden = false; };
  api.hide = () => { el.root.hidden = true; };

  api.toast = (text) => {
    const div = document.createElement('div');
    div.className = 'toast';
    div.textContent = text;
    el.toasts.appendChild(div);
    while (el.toasts.children.length > 4) el.toasts.firstChild.remove();
    setTimeout(() => div.remove(), 3200);
  };

  api.hint = (text, secs = 6) => {
    el.hint.textContent = text;
    el.hint.style.display = 'block';
    hintUntil = now() + secs;
  };

  /** Queue a line of dialogue: speaker, text, how long it stays, and seconds until it appears. */
  api.say = (who, text, dur = 5, delay = 0) => {
    subs.push({ who, text, start: now() + delay, end: now() + delay + dur });
  };

  api.banner = (title, sub, kind = 'info') => {
    el.banner.className = `show ${kind}`;
    el.banner.querySelector('h2').textContent = title;
    el.banner.querySelector('p').textContent = sub;
    bannerUntil = now() + 4;
  };

  api.clearBanner = () => {
    el.banner.classList.remove('show');
    bannerUntil = 0;
  };

  api.flashHurt = () => {
    el.hurt.classList.add('on');
    setTimeout(() => el.hurt.classList.remove('on'), 90);
  };

  api.flashWanted = () => {
    el.stars.classList.add('hot');
    setTimeout(() => el.stars.classList.remove('hot'), 1600);
  };

  api.setBust = (r) => {
    el.bust.style.display = r > 0.02 ? 'block' : 'none';
    el.bust.firstElementChild.style.width = `${Math.min(100, r * 100)}%`;
  };

  api.update = () => {
    const p = game.player;
    const t = now();
    set('money', el.money, `$${Math.floor(game.money).toLocaleString('en-US')}`);
    const level = game.police.level;
    starEls.forEach((s, i) => s.classList.toggle('on', i < level));
    el.stars.classList.toggle('hide', level > 0 && !game.police.seen && !el.stars.classList.contains('hot'));
    set('clock', el.clock, formatClock(game.clock));
    el.hp.style.width = `${Math.max(0, p.health)}%`;
    set('ammo', el.ammo, `AMMO ${p.ammo}`);

    const car = p.car;
    el.speedo.hidden = !car;
    if (car) {
      set('kmh', el.kmh, String(Math.round(car.speedKmh)));
      set('carname', el.carname, car.spec.name);
      el.carhp.style.width = `${Math.max(0, (car.hp / car.spec.hp) * 100)}%`;
    }
    el.crosshair.classList.toggle('on', !car && (game.input.mouse.right || p.aimT > 0));

    // enter / exit prompt
    let prompt = '';
    if (game.state === 'play') {
      if (car) prompt = car.speed < 6 ? 'E  Exit vehicle' : '';
      else {
        const near = p.nearestEnterable();
        if (near) prompt = `E  Enter ${near.spec.name}`;
      }
    }
    set('prompt', el.prompt, prompt);
    el.prompt.style.display = prompt ? 'inline-block' : 'none';

    // objective
    const o = game.objective;
    if (o && game.state === 'play') {
      el.objective.style.display = 'block';
      set('obj', el.objText, o.text);
      set('objd', el.objDist, `${Math.round(dist(p.x, p.z, o.x, o.z))} m`);
    } else el.objective.style.display = 'none';

    if (hintUntil && t > hintUntil) {
      el.hint.style.display = 'none';
      hintUntil = 0;
    }
    if (bannerUntil && t > bannerUntil) {
      el.banner.classList.remove('show');
      bannerUntil = 0;
    }
    // subtitles
    let cur = null;
    for (let i = subs.length - 1; i >= 0; i -= 1) {
      const s = subs[i];
      if (t > s.end) subs.splice(i, 1);
      else if (t >= s.start && (!cur || s.start < cur.start)) cur = s;
    }
    if (cur) {
      el.subtitle.style.display = 'block';
      const html = `<b>${cur.who}:</b> ${cur.text}`;
      if (last.sub !== html) {
        last.sub = html;
        el.subtitle.innerHTML = html;
      }
    } else el.subtitle.style.display = 'none';
  };

  return api;
}
