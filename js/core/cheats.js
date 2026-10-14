/* ============ cheats.js — 自用版：作弊 / 玩法調整面板 ============
 * F1（或右下角 ⚙）開關面板。設定存在 localStorage（ps.cheats），重開仍保留。
 * 其他檔案用 G.Cheats.get() 讀取目前設定：
 *   player.js（經驗、無敵、HP／速度／金幣）· enemy.js（傷害）· run-ui.js（重抽）
 *   gacha.js（免費抽、抽卡異色率）· spawner.js（敵人數量、野生異色率）
 * 整個面板加了 translate="no"，不會被遊戲的翻譯系統改動。
 */
G.Cheats = (() => {
  const KEY = 'ps.cheats';
  const DEFAULTS = {
    xpMult: 1, damageMult: 1, enemyMult: 1, coinMult: 1,
    hpMult: 1, speedMult: 1,
    godMode: false, infiniteRerolls: false, infiniteGacha: false,
    wildShinyRate: 1 / 4096, gachaShinyRate: 1 / 100
  };
  let cfg = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return Object.assign({}, DEFAULTS, JSON.parse(raw));
    } catch (e) { /* 讀不到就用預設 */ }
    return Object.assign({}, DEFAULTS);
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* 無法儲存 */ } }
  function get() { return cfg; }

  // ---------------- 存檔動作 ----------------
  function save() { return G.DB && G.DB.save; }
  function inRun() { const s = G.Game && G.Game.state; return !!s && s !== 'ui' && s !== 'over'; }
  function commit() { try { G.DB.commit(true); } catch (e) { /* 無法儲存 */ } }

  /** 所有有圖的寶可夢（legendary 也算） */
  function allDex() { return G.DEX.filter(p => G.SPRITE_META[p.dex]).map(p => p.dex); }

  function unlockAll() {
    const s = save(); if (!s) return '請先進入遊戲。';
    let n = 0;
    for (const dex of allDex()) if (!s.owned[dex]) { s.owned[dex] = { at: Date.now(), from: 'cheat' }; n++; }
    commit();
    return `已解鎖全部寶可夢（新增 ${n} 隻，共 ${allDex().length} 隻）。`;
  }
  function unlockShinies() {
    const s = save(); if (!s) return '請先進入遊戲。';
    s.shiny = s.shiny || {};
    let n = 0, total = 0;
    for (const dex of allDex()) {
      if (!G.Sprites.hasShiny(dex)) continue;
      total++;
      if (!s.owned[dex]) s.owned[dex] = { at: Date.now(), from: 'cheat' };
      if (!s.shiny[dex]) { s.shiny[dex] = { at: Date.now(), from: 'cheat' }; n++; }
    }
    commit();
    return `已解鎖全部異色寶可夢（新增 ${n} 隻，有異色圖的共 ${total} 隻）。`;
  }
  function addTickets() {
    const s = save(); if (!s) return '請先進入遊戲。';
    s.tickets = s.tickets || { t1: 0, t10: 0 };
    s.tickets.t1 += 1000; s.tickets.t10 += 100;
    commit();
    return `抽卡券：×1 共 ${s.tickets.t1} 張、×10 共 ${s.tickets.t10} 張。`;
  }
  function addCoins() {
    const s = save(); if (!s) return '請先進入遊戲。';
    s.coins += 99999;
    commit();
    return `金幣：${s.coins.toLocaleString()}`;
  }
  function levelUp() {
    if (!inRun() || !G.Game.player) return '請在戰鬥中使用。';
    G.Game.debugLevelUp();
    return null;
  }

  // ---------------- 面板 ----------------
  let panel = null, pausedByMe = false;

  const CSS = `
#ch-fab{position:fixed;right:10px;bottom:10px;z-index:99998;width:34px;height:34px;border-radius:50%;
  border:1px solid #666;background:#1a1a2ecc;color:#ffcc00;font-size:18px;cursor:pointer;opacity:.4;padding:0}
#ch-fab:hover{opacity:1}
#ch-panel{position:fixed;inset:0;z-index:99999;display:none;align-items:center;justify-content:center;background:#000a;
  font-family:system-ui,"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif;color:#eee}
#ch-panel .box{background:#14142a;border:2px solid #ffcc00;border-radius:12px;padding:16px 20px;width:min(460px,94vw);
  max-height:92vh;overflow:auto;box-shadow:0 8px 30px #000;text-align:left}
#ch-panel h2{margin:0 0 4px;color:#ffcc00;font-size:20px}
#ch-panel .hint{color:#999;font-size:12px;margin-bottom:10px}
#ch-panel h3{margin:12px 0 6px;font-size:14px;color:#88ccff;border-bottom:1px solid #333;padding-bottom:3px}
#ch-panel .row{display:flex;justify-content:space-between;align-items:center;margin:6px 0;font-size:14px;gap:10px}
#ch-panel select{background:#22223a;color:#fff;border:1px solid #555;border-radius:6px;padding:3px 6px;font-size:14px}
#ch-panel input[type=checkbox]{width:18px;height:18px;accent-color:#ffcc00}
#ch-panel .act{background:#2a2a4a;color:#fff;border:1px solid #666;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:13px;margin:3px 3px 3px 0}
#ch-panel .act:hover{background:#3a3a6a;border-color:#ffcc00}
#ch-panel .msg{min-height:18px;color:#7f7;font-size:13px;margin-top:8px}
#ch-panel .x{float:right;background:none;border:none;color:#aaa;font-size:20px;cursor:pointer}
#ch-panel small{color:#888}`;

  const MULTS = [0.5, 1, 1.5, 2, 3, 5, 10, 20, 50];
  const WILD = [[1 / 4096, '1/4096（原版）'], [1 / 512, '1/512'], [1 / 64, '1/64'], [1 / 8, '1/8'], [1, '100%']];
  const GACHA = [[1 / 100, '1/100（原版）'], [1 / 20, '1/20'], [1 / 5, '1/5'], [1, '100%']];

  function sel(key, opts) {
    const list = opts.map(o => Array.isArray(o) ? o : [o, '×' + o]);
    if (!list.some(([v]) => v === cfg[key])) list.push([cfg[key], String(cfg[key])]);
    return `<select data-k="${key}">${list.map(([v, l]) => `<option value="${v}"${v === cfg[key] ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  }
  const chk = key => `<input type="checkbox" data-k="${key}"${cfg[key] ? ' checked' : ''}>`;

  function render() {
    panel.innerHTML = `<div class="box">
      <button class="x" data-a="close">✕</button>
      <h2>⚙ 作弊 / 玩法調整</h2>
      <div class="hint">F1 開關此面板 · 設定自動儲存</div>
      <h3>戰鬥中即時生效</h3>
      <div class="row"><span>經驗倍率</span>${sel('xpMult', MULTS)}</div>
      <div class="row"><span>傷害倍率</span>${sel('damageMult', MULTS)}</div>
      <div class="row"><span>敵人數量倍率</span>${sel('enemyMult', [0.25, 0.5, 1, 1.5, 2, 3])}</div>
      <div class="row"><span>野生異色機率</span>${sel('wildShinyRate', WILD)}</div>
      <div class="row"><span>無敵模式</span>${chk('godMode')}</div>
      <div class="row"><span>無限技能重抽 <small>（升級時按「重抽」或 R）</small></span>${chk('infiniteRerolls')}</div>
      <h3>下一局開始時生效</h3>
      <div class="row"><span>最大 HP 倍率</span>${sel('hpMult', MULTS)}</div>
      <div class="row"><span>移動速度倍率</span>${sel('speedMult', [0.75, 1, 1.25, 1.5, 2, 3])}</div>
      <div class="row"><span>結算金幣倍率</span>${sel('coinMult', MULTS)}</div>
      <h3>抽卡</h3>
      <div class="row"><span>無限抽卡 <small>（不消耗抽卡券）</small></span>${chk('infiniteGacha')}</div>
      <div class="row"><span>抽卡異色機率</span>${sel('gachaShinyRate', GACHA)}</div>
      <h3>動作</h3>
      <button class="act" data-a="levelup">⬆ 立刻升一級（戰鬥中）</button>
      <button class="act" data-a="all">🔓 解鎖全部寶可夢</button>
      <button class="act" data-a="shiny">✨ 解鎖全部異色寶可夢</button>
      <button class="act" data-a="tickets">🎟 抽卡券 +1000 / ×10 券 +100</button>
      <button class="act" data-a="coins">💰 金幣 +99,999</button>
      <button class="act" data-a="reset">↺ 作弊設定恢復預設</button>
      <div class="msg" id="ch-msg"></div>
      <small>存檔類動作在主選單使用時，畫面會自動重新整理。</small>
    </div>`;
  }

  function msg(t) { const el = panel.querySelector('#ch-msg'); if (el) el.textContent = t || ''; }

  function afterSaveAction(text) {
    msg(text);
    // 不在戰鬥中：重新整理讓選單、圖鑑、抽卡畫面讀到新存檔
    if (!inRun()) setTimeout(() => location.reload(), 900);
  }

  function action(a) {
    switch (a) {
      case 'close': return toggle(false);
      case 'levelup': { const err = levelUp(); if (err) msg(err); else toggle(false); return; }
      case 'all': return afterSaveAction(unlockAll());
      case 'shiny': return afterSaveAction(unlockShinies());
      case 'tickets': return afterSaveAction(addTickets());
      case 'coins': return afterSaveAction(addCoins());
      case 'reset': cfg = Object.assign({}, DEFAULTS); persist(); render(); return msg('已恢復預設。');
    }
  }

  function toggle(force) {
    const open = force !== undefined ? force : panel.style.display !== 'flex';
    if (open) {
      render();
      panel.style.display = 'flex';
      if (G.Game && G.Game.state === 'playing' && !(G.Coop && G.Coop.active)) { G.Game.togglePause(); pausedByMe = true; }
    } else {
      panel.style.display = 'none';
      if (pausedByMe && G.Game && G.Game.state === 'paused') G.Game.togglePause();
      pausedByMe = false;
    }
  }

  function init() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const fab = document.createElement('button');
    fab.id = 'ch-fab'; fab.textContent = '⚙'; fab.setAttribute('translate', 'no'); fab.title = 'F1';
    fab.onclick = () => toggle();
    document.body.appendChild(fab);
    panel = document.createElement('div');
    panel.id = 'ch-panel'; panel.setAttribute('translate', 'no');
    panel.addEventListener('click', e => {
      if (e.target === panel) return toggle(false);
      const b = e.target.closest('[data-a]'); if (b) action(b.dataset.a);
    });
    panel.addEventListener('change', e => {
      const k = e.target.dataset.k; if (!k) return;
      cfg[k] = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value);
      persist(); msg('已儲存。');
    });
    // 面板開著時，鍵盤不傳給遊戲
    ['keydown', 'keyup'].forEach(t => panel.addEventListener(t, e => e.stopPropagation()));
    document.body.appendChild(panel);
    addEventListener('keydown', e => {
      if (e.key === 'F1') { e.preventDefault(); toggle(); }
    }, true);
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', init); else init();

  return { get, toggle };
})();
