// Title, pause and Wasted/Busted screens; they only show/hide DOM, main.js owns what buttons do.
import { sfxClick } from './audio.js';

export function createMenus(hooks) {
	const $ = (id) => document.getElementById(id);
	const start = $('screen-start');
	const pause = $('screen-pause');
	const end = $('screen-end');
	const api = {};

	const bind = (id, fn) => $(id).addEventListener('click', () => {
		sfxClick();
		fn();
	});
	bind('btn-new', () => hooks.newGame());
	bind('btn-continue', () => hooks.continueGame());
	bind('btn-resume', () => hooks.resume());
	bind('btn-save', () => {
		const ok = hooks.save();
		$('save-note').textContent = ok ? 'Game saved.' : 'Could not save in this browser.';
	});
	bind('btn-quit', () => hooks.quit());

	api.showStart = (hasSave) => {
		$('btn-continue').disabled = !hasSave;
		start.hidden = false;
	};
	api.hideStart = () => { start.hidden = true; };
	api.showPause = () => {
		$('save-note').textContent = '';
		pause.hidden = false;
	};
	api.hidePause = () => { pause.hidden = true; };
	api.showEnd = (kind, sub) => {
		$('end-title').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
		$('end-sub').textContent = sub;
		end.firstElementChild.className = `endcard ${kind}`;
		end.hidden = false;
	};
	api.hideEnd = () => { end.hidden = true; };
	return api;
}
