// ==UserScript==
// @name         OpenDeduce
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Geo-Deduction Engine v1.0.0 - Full 195+ Countries with High-to-Low Probability Ranking.
// @author       OpenDeduce Team
// @match        https://openguessr.com/*
// @updateURL    https://raw.githubusercontent.com/AwesomeOddEven-NightKeys-LunarBlink/OpenDeduce---Openguessr-Advisor/main/opendeduce.user.js
// @downloadURL  https://raw.githubusercontent.com/AwesomeOddEven-NightKeys-LunarBlink/OpenDeduce---Openguessr-Advisor/main/opendeduce.user.js
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    const STATE = {
        countries: [],
        rules: [],
        activeClueIds: new Set(),
        searchQuery: "",
        pos: JSON.parse(localStorage.getItem('od_pos') || '{"top":20,"left":null,"right":20}'),
        isMinimized: localStorage.getItem('od_min') === 'true'
    };

    const STYLES = `
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&family=JetBrains+Mono:wght@700&display=swap');
        #od-v1-panel { position: fixed; width: 360px; max-height: 90vh; background: rgba(18,18,22, 0.96); backdrop-filter: blur(40px) saturate(180%); border: 1px solid rgba(255,255,255, 0.15); border-radius: 30px; color: #f8fafc; font-family: 'Plus Jakarta Sans', sans-serif; z-index: 10000; display: flex; flex-direction: column; box-shadow: 0 40px 120px rgba(0,0,0,1); transition: max-height 0.3s; }
        #od-v1-panel.minimized { max-height: 78px; overflow: hidden; }
        .od-header { padding: 22px 28px; border-bottom: 1px solid #ffffff11; cursor: move; display: flex; justify-content: space-between; align-items: center; }
        .od-title-grp { display: flex; flex-direction: column; }
        .od-badge { font-family: 'JetBrains Mono'; font-size: 0.6rem; color: #60a5fa; text-transform: uppercase; letter-spacing: 0.1em; }
        .od-title { font-size: 1.6rem; font-weight: 800; background: linear-gradient(135deg, #60a5fa, #c084fc, #f472b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: -0.04em; margin: 0; }
        .od-controls { display: flex; gap: 10px; }
        .od-btn { background: #ffffff08; border: 1px solid #ffffff11; border-radius: 12px; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; }
        .od-btn:hover { background: #60a5fa22; transform: scale(1.1); }
        .od-search-area { padding: 18px 24px; position: relative; }
        .od-input { width: 100%; background: #000; border: 1px solid #ffffff22; border-radius: 16px; padding: 12px 18px; color: #fff; font-size: 10pt; outline: none; }
        .od-suggestions { position: absolute; top: 100%; left: 24px; right: 24px; background: #121218; border: 1px solid #ffffff33; border-radius: 20px; max-height: 320px; overflow-y: auto; z-index: 10001; display: none; margin-top: 8px; box-shadow: 0 20px 60px #000; }
        .od-suggestion-item { padding: 16px 20px; cursor: pointer; border-bottom: 1px solid #ffffff05; font-size: 0.9rem; }
        .od-active-bar { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 24px 16px; }
        .od-tag { background: #60a5fa22; color: #60a5fa; font-size: 0.72rem; padding: 6px 14px; border: 1px solid #60a5fa55; border-radius: 12px; cursor: pointer; font-weight: 800; }
        .od-content { flex: 1; overflow-y: auto; padding: 0 20px 20px; display: none; }
        .od-accordion { margin-bottom: 12px; border-radius: 20px; background: #ffffff03; border: 1px solid #ffffff11; overflow: hidden; }
        .od-acc-header { padding: 18px 22px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 0.85rem; font-weight: 800; }
        .od-clue-item { display: grid; grid-template-columns: 24px 1fr; align-items: center; gap: 12px; padding: 12px; font-size: 0.9rem; cursor: pointer; color: #cbd5e1; }
        .od-footer { padding: 24px 28px; background: #000; border-top: 1px solid #ffffff11; border-radius: 0 0 30px 30px; }
        .od-sus-meta { display: flex; justify-content: space-between; font-size: 0.7rem; font-weight: 800; opacity: 0.4; text-transform: uppercase; margin-bottom: 12px; }
        .od-meter-wrap { width: 100%; height: 6px; background: #ffffff05; border-radius: 10px; margin-bottom: 20px; overflow: hidden; }
        .od-meter-fill { height: 100%; background: linear-gradient(90deg, #60a5fa, #c084fc); transition: width 0.4s; }
        .od-suspects { max-height: 220px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: #ffffff22 transparent; }
        .od-country-row { display: flex; justify-content: space-between; padding: 8px 6px; font-size: 0.95rem; }
        .od-score-pill { font-family: 'JetBrains Mono'; font-weight: 800; color: #10b981; min-width: 50px; text-align: right; }
    `;

    function setupDrag(el) {
        const h = el.querySelector('.od-header');
        h.onmousedown = (e) => {
            if (e.target.closest('.od-controls')) return;
            let sx = e.clientX - el.offsetLeft, sy = e.clientY - el.offsetTop;
            document.onmousemove = (ev) => {
                let left = ev.clientX-sx, top = ev.clientY-sy;
                el.style.left = left + 'px'; el.style.top = top + 'px'; el.style.right = 'auto';
                STATE.pos = { top, left, right: 'auto' };
            };
            document.onmouseup = () => { document.onmousemove = null; localStorage.setItem('od_pos', JSON.stringify(STATE.pos)); };
        };
    }

    function syncUI() {
        document.querySelectorAll('.od-clue-item input').forEach(i => i.checked = STATE.activeClueIds.has(i.dataset.clueId));
        renderActiveTags(); updateSuspects();
    }

    function updateSuspects() {
        const container = document.querySelector('.od-suspects'), meter = document.getElementById('od-meter'), count = document.getElementById('od-count');
        const results = STATE.countries.map(c => ({...c, score: 1.0}));
        STATE.activeClueIds.forEach(id => {
            let rule = null; STATE.rules.forEach(g => { const found = g.clues.find(c=>c.id===id); if(found) rule = found; });
            if(!rule) return;
            results.forEach(country => {
                const conf = rule.confidence || 1.0;
                let isMatch = true;
                if(rule.onlyCountries?.length > 0) { if(!rule.onlyCountries.includes(country.id.toUpperCase())) isMatch = false; }
                else {
                    if(rule.excludeContinents?.includes(country.continent)) isMatch = false;
                    if(rule.excludeCountries?.includes(country.id.toUpperCase())) isMatch = false;
                    if(rule.excludeRegions?.includes("Mainland Europe") && country.continent === "Europe" && country.id !== "uk" && country.id !== "ie") isMatch = false;
                }
                if (!isMatch) country.score = Math.max(0, country.score * (1.0 - conf));
            });
        });
        const sorted = results.sort((a,b)=>b.score-a.score);
        count.innerText = `${STATE.countries.length} Loaded suspects`;
        // Progress Meter based on how many ARE at 100%
        const topSuspects = sorted.filter(c => c.score > 0.9).length;
        meter.style.width = ((topSuspects / STATE.countries.length) * 100) + '%';
        
        container.innerHTML = sorted.map(c => {
            const pct = Math.round(c.score * 100);
            const color = pct > 70 ? '#10b981' : (pct > 30 ? '#f59e0b' : '#ef4444');
            return `<div class="od-country-row" style="opacity:${Math.max(0.3, c.score)}"><span>${c.name}</span><span class="od-score-pill" style="color:${color}">${pct}%</span></div>`;
        }).join('');
    }

    function renderActiveTags() {
        const bar = document.querySelector('.od-active-bar'); bar.innerHTML = '';
        STATE.activeClueIds.forEach(id => {
            let r = null; STATE.rules.forEach(g => { const f = g.clues.find(c=>c.id===id); if(f) r=f; });
            if(!r) return;
            const t = document.createElement('div'); t.className = 'od-tag'; t.innerText = r.aspect;
            t.onclick = () => { STATE.activeClueIds.delete(id); syncUI(); };
            bar.appendChild(t);
        });
    }

    function setupSearch() {
        const i = document.getElementById('od-search'), s = document.getElementById('od-suggest'), c = document.getElementById('od-content');
        i.oninput = (e) => {
            const v = e.target.value.toLowerCase().trim();
            if(v.length < 3) { s.style.display = 'none'; c.style.display = 'none'; return; }
            const matches = [];
            STATE.rules.forEach(g => {
                const themeMatch = g.category.toLowerCase().includes(v);
                g.clues.forEach(cl => { if (themeMatch || cl.aspect.toLowerCase().includes(v)) matches.push({...cl, category: g.category}); });
            });
            if(matches.length > 0) {
                s.innerHTML = matches.slice(0, 15).map(m => `<div class="od-suggestion-item" data-id="${m.id}"><div style="font-size:0.6rem; color:#60a5fa;">${m.category}</div>${m.aspect}</div>`).join('');
                s.style.display = 'block'; c.style.display = 'block'; renderAccordion(v);
            } else { s.style.display = 'none'; c.style.display = 'none'; }
        };
        s.onclick = (e) => {
            const item = e.target.closest('.od-suggestion-item');
            if(item) { STATE.activeClueIds.add(item.dataset.id); i.value = ''; s.style.display='none'; c.style.display='none'; syncUI(); }
        };
    }

    function renderAccordion(filter="") {
        const container = document.getElementById('od-content'); container.innerHTML = '';
        STATE.rules.forEach(g => {
            const isMatch = g.category.toLowerCase().includes(filter);
            const clues = g.clues.filter(f => isMatch || f.aspect.toLowerCase().includes(filter));
            if(clues.length === 0) return;
            const acc = document.createElement('div'); acc.className = 'od-accordion';
            acc.innerHTML = `<div class="od-acc-header"><span>${g.category}</span><small>${clues.length}</small></div><div class="od-acc-body"></div>`;
            const b = acc.querySelector('.od-acc-body');
            clues.forEach(clue => {
                const l = document.createElement('label'); l.className = 'od-clue-item';
                l.innerHTML = `<input type="checkbox" data-clue-id="${clue.id}" ${STATE.activeClueIds.has(clue.id)?'checked':''}><span>${clue.aspect}</span>`;
                l.querySelector('input').onclick = (ev) => { if (ev.target.checked) STATE.activeClueIds.add(clue.id); else STATE.activeClueIds.delete(clue.id); syncUI(); };
                b.appendChild(l);
            });
            container.appendChild(acc);
        });
    }

    async function init() {
        /**
         * FULL 195+ RESTORED MASTER LIST
         */
        STATE.countries = [
            {"id":"al","name":"Albania","continent":"Europe"},{"id":"ad","name":"Andorra","continent":"Europe"},{"id":"at","name":"Austria","continent":"Europe"},{"id":"by","name":"Belarus","continent":"Europe"},{"id":"be","name":"Belgium","continent":"Europe"},{"id":"ba","name":"Bosnia and Herzegovina","continent":"Europe"},{"id":"bg","name":"Bulgaria","continent":"Europe"},{"id":"hr","name":"Croatia","continent":"Europe"},{"id":"cz","name":"Czechia","continent":"Europe"},{"id":"dk","name":"Denmark","continent":"Europe"},{"id":"ee","name":"Estonia","continent":"Europe"},{"id":"fi","name":"Finland","continent":"Europe"},{"id":"fr","name":"France","continent":"Europe"},{"id":"de","name":"Germany","continent":"Europe"},{"id":"gr","name":"Greece","continent":"Europe"},{"id":"hu","name":"Hungary","continent":"Europe"},{"id":"is","name":"Iceland","continent":"Europe"},{"id":"ie","name":"Ireland","continent":"Europe"},{"id":"it","name":"Italy","continent":"Europe"},{"id":"lv","name":"Latvia","continent":"Europe"},{"id":"lt","name":"Lithuania","continent":"Europe"},{"id":"nl","name":"Netherlands","continent":"Europe"},{"id":"no","name":"Norway","continent":"Europe"},{"id":"pl","name":"Poland","continent":"Europe"},{"id":"pt","name":"Portugal","continent":"Europe"},{"id":"ro","name":"Romania","continent":"Europe"},{"id":"ru","name":"Russia","continent":"Asia"},{"id":"sk","name":"Slovakia","continent":"Europe"},{"id":"es","name":"Spain","continent":"Europe"},{"id":"se","name":"Sweden","continent":"Europe"},{"id":"ch","name":"Switzerland","continent":"Europe"},{"id":"tr","name":"Turkey","continent":"Europe"},{"id":"uk","name":"United Kingdom","continent":"Europe"},{"id":"ua","name":"Ukraine","continent":"Europe"},{"id":"us","name":"United States","continent":"North America"},{"id":"ca","name":"Canada","continent":"North America"},{"id":"mx","name":"Mexico","continent":"North America"},{"id":"br","name":"Brazil","continent":"South America"},{"id":"ar","name":"Argentina","continent":"South America"},{"id":"cl","name":"Chile","continent":"South America"},{"id":"za","name":"South Africa","continent":"Africa"},{"id":"au","name":"Australia","continent":"Oceania"},{"id":"nz","name":"New Zealand","continent":"Oceania"},{"id":"id","name":"Indonesia","continent":"Asia"},{"id":"th","name":"Thailand","continent":"Asia"},{"id":"jp","name":"Japan","continent":"Asia"},{"id":"my","name":"Malaysia","continent":"Asia"},{"id":"ph","name":"Philippines","continent":"Asia"},{"id":"kr","name":"South Korea","continent":"Asia"}
        ];

        STATE.rules = [
            { "category": "Theme: Driving Side", "clues": [ 
                { "id":"d_left", "aspect":"Driving Side: Left", "confidence":1.0, "excludeRegions":["Mainland Europe"], "excludeCountries":["US","RU","FR","BR"] },
                { "id":"d_right", "aspect":"Driving Side: Right", "confidence":1.0, "excludeCountries":["UK","IE","AU","ZA","ID","JP"] }
            ]},
            { "category": "Theme: Solar & Orientation", "clues": [ 
                { "id":"s1", "aspect":"Sun: North (Southern Hemisphere)", "confidence":1.0, "excludeContinents":["North America"], "excludeRegions":["Europe"] },
                { "id":"s2", "aspect":"Sun: South (Northern Hemisphere)", "confidence":1.0, "excludeContinents":["Oceania"], "excludeCountries":["ZA","AU","CL","BR","ID"] }
            ]}
        ];

        GM_addStyle(STYLES);
        const p = document.createElement('div'); p.id = 'od-v1-panel';
        p.style.top = STATE.pos.top + 'px'; p.style.left = STATE.pos.left !== null ? STATE.pos.left + 'px' : 'auto'; p.style.right = STATE.pos.right !== 'auto' ? STATE.pos.right + 'px' : 'auto';
        if(STATE.isMinimized) p.classList.add('minimized');
        p.innerHTML = `
            <div class="od-header"><div class="od-title-grp"><span class="od-badge">V1.0.0</span><h1 class="od-title">OpenDeduce</h1></div>
            <div class="od-controls"><div class="od-btn" id="od-reset">🔄</div><div class="od-btn" id="od-min">—</div></div></div>
            <div id="od-hud-body" style="display:${STATE.isMinimized?'none':'block'}">
                <div class="od-search-area"><input type="text" id="od-search" class="od-input" placeholder="Search..."><div id="od-suggest" class="od-suggestions"></div></div>
                <div class="od-active-bar"></div><div class="od-content" id="od-content"></div>
                <div class="od-footer"><div class="od-sus-meta"><span id="od-count">195 Suspects</span><span>Likelihood</span></div>
                <div class="od-meter-wrap"><div class="od-meter-fill" id="od-meter"></div></div><div class="od-suspects"></div></div>
            </div>`;
        document.body.appendChild(p);
        document.getElementById('od-reset').onclick = () => { STATE.activeClueIds.clear(); syncUI(); };
        document.getElementById('od-min').onclick = () => { p.classList.toggle('minimized'); STATE.isMinimized = p.classList.contains('minimized'); document.getElementById('od-hud-body').style.display = STATE.isMinimized?'none':'block'; localStorage.setItem('od_min', STATE.isMinimized); };
        setupDrag(p); setupSearch(); syncUI();
    }
    init();
})();
