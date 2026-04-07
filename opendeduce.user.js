// ==UserScript==
// @name         OpenDeduce
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Geo-Deduction advisor with Movable, Minimizable HUD and fuzzy 3-letter search logic.
// @author       OpenDeduce Team
// @match        https://openguessr.com/*
// @updateURL    https://raw.githubusercontent.com/AwesomeOddEven-NightKeys-LunarBlink/OpenDeduce---Openguessr-Advisor/main/opendeduce.user.js
// @downloadURL  https://raw.githubusercontent.com/AwesomeOddEven-NightKeys-LunarBlink/OpenDeduce---Openguessr-Advisor/main/opendeduce.user.js
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    /**
     * STATE MANAGEMENT
     */
    const STATE = {
        countries: [],
        rules: [],
        activeClueIds: new Set(),
        isMinimized: false,
        posValue: { x: 0, y: 0 },
        isDragging: false,
        isLoaded: false
    };

    /**
     * STYLESHEET
     */
    const STYLES = `
        #od-v2-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 350px;
            max-height: 90vh;
            background: rgba(30,30,36, 0.97);
            backdrop-filter: blur(25px) saturate(180%);
            border: 1px solid rgba(255,255,255, 0.15);
            border-radius: 28px;
            color: #f8fafc;
            font-family: 'Inter', system-ui, sans-serif;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            box-shadow: 0 40px 100px rgba(0,0,0,0.9);
            transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        #od-v2-panel.minimized {
            max-height: 75px;
            overflow: hidden;
        }

        .od-header {
            padding: 22px 28px;
            background: rgba(255,255,255,0.04);
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            cursor: move;
            display: flex;
            justify-content: space-between;
            align-items: center;
            user-select: none;
        }
        .od-header-main { display: flex; flex-direction: column; }
        .od-title { font-size: 1.5rem; font-weight: 900; background: linear-gradient(135deg, #60a5fa, #c084fc, #f472b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: -0.04em; margin: 0; }
        .od-badge { font-size: 0.6rem; color: #60a5fa; text-transform: uppercase; letter-spacing: 0.2em; font-weight: 800; }

        .od-controls { display: flex; gap: 12px; }
        .od-control-btn {
            background: rgba(255,255,255,0.08);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 12px;
            width: 32px; height: 32px;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer;
            transition: all 0.2s;
        }
        .od-control-btn:hover { background: rgba(96, 165, 250, 0.2); border-color: #60a5fa; transform: scale(1.1); }
        .od-reset-btn:hover { border-color: #ef4444; color: #ef4444; }

        .od-search-container { padding: 18px 24px; position: relative; }
        .od-input { width: 100%; background: #0a0a0c; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 14px; padding: 12px 18px; color: #fff; font-size: 0.95rem; outline: none; }
        .od-input:focus { border-color: #60a5fa; }

        .od-suggestions { 
            position: absolute; top: 100%; left: 24px; right: 24px; 
            background: #15151a; border: 1px solid rgba(255, 255, 255, 0.25); 
            border-radius: 18px; max-height: 280px; overflow-y: auto; 
            z-index: 10001; display: none; margin-top: 8px;
            box-shadow: 0 15px 50px rgba(0,0,0,1);
        }
        .od-suggestion-item { padding: 14px 20px; font-size: 0.88rem; cursor: pointer; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
        .od-suggestion-item:hover { background: rgba(96, 165, 250, 0.2); }

        .od-active-container { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 24px 16px; }
        .od-tag { 
            background: rgba(96, 165, 250, 0.2); color: #60a5fa; 
            font-size: 0.72rem; padding: 6px 14px; border: 1px solid rgba(96, 165, 250, 0.4); 
            border-radius: 12px; cursor: pointer; font-weight: 800;
        }
        .od-tag:hover { border-color: #ef4444; color: #ef4444; }

        .od-content { flex: 1; overflow-y: auto; padding: 0 20px 20px; scrollbar-width: none; }
        .od-content::-webkit-scrollbar { width: 0; display:none; }
        
        .od-accordion { margin-bottom: 10px; border-radius: 18px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.06); }
        .od-acc-header { padding: 16px 20px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem; font-weight: 800; }
        .od-acc-body { display: none; padding: 6px 20px 20px; border-top: 1px solid rgba(255, 255, 255, 0.03); }
        .od-acc-body.active { display: block; }

        .od-clue-item {
            display: grid;
            grid-template-columns: 24px 1fr;
            align-items: center;
            gap: 12px;
            padding: 10px 0;
            font-size: 0.9rem;
            cursor: pointer;
            transition: color 0.2s;
        }
        .od-clue-item:hover { color: #60a5fa; }
        .od-clue-item input { width: 18px; height: 18px; cursor: pointer; accent-color: #60a5fa; margin: 0; }

        .od-results { padding: 24px 28px; background: #000; border-top: 1px solid rgba(255, 255, 255, 0.1); }
        .od-res-header { display: flex; justify-content: space-between; font-size: 0.75rem; font-weight: 900; opacity: 0.5; text-transform: uppercase; margin-bottom: 14px; }
        .od-country-list { max-height: 220px; overflow-y: auto; }
        .od-country-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 8px; border-radius: 12px; font-size: 0.95rem; }
        .od-score-pill { font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; font-weight: 900; min-width: 45px; text-align: right; }

        #od-tooltip { position: fixed; pointer-events: none; background: #0a0a0f; border: 1px solid rgba(255, 255, 255, 0.25); padding: 14px; border-radius: 18px; z-index: 10002; width: 250px; display: none; box-shadow: 0 20px 60px #000; }
        .od-tooltip-img { width: 100%; height: 140px; border-radius: 12px; margin-bottom: 12px; object-fit: cover; }
    `;

    /**
     * CORE LOGIC: DRAG & DROP
     */
    function setupDragAndDrop(el) {
        const header = el.querySelector('.od-header');
        header.onmousedown = (e) => {
            if (e.target.closest('.od-controls')) return; 
            STATE.isDragging = true;
            let startX = e.clientX - el.offsetLeft;
            let startY = e.clientY - el.offsetTop;
            document.onmousemove = (e) => {
                if (!STATE.isDragging) return;
                el.style.left = (e.clientX - startX) + 'px';
                el.style.top = (e.clientY - startY) + 'px';
                el.style.right = 'auto'; 
            };
            document.onmouseup = () => { STATE.isDragging = false; document.onmousemove = null; };
        };
    }

    /**
     * DATABASE SYNC
     */
    function syncUI() {
        document.querySelectorAll('.od-clue-item input').forEach(input => {
            input.checked = STATE.activeClueIds.has(input.dataset.clueId);
        });
        renderActiveTags();
        updateSuspects();
    }

    function updateSuspects() {
        const listContainer = document.querySelector('.od-country-list');
        const countLabel = document.getElementById('od-suspect-count');
        if(!listContainer) return;
        const results = STATE.countries.map(c => ({ ...c, score: 1.0 }));
        STATE.activeClueIds.forEach(id => {
            const rule = findRuleById(id);
            if (!rule) return;
            results.forEach(country => {
                const conf = rule.confidence || 1.0;
                let isMatch = true;
                if (rule.onlyCountries?.length > 0) {
                    if (!rule.onlyCountries.includes(country.id.toUpperCase())) isMatch = false;
                } else {
                    if (rule.excludeContinents?.includes(country.continent)) isMatch = false;
                    if (rule.excludeCountries?.includes(country.id.toUpperCase())) isMatch = false;
                    if (rule.excludeRegions?.includes("Mainland Europe") && country.continent === "Europe" && country.id !== "uk" && country.id !== "ie") isMatch = false;
                }
                if (!isMatch) country.score = Math.max(0, country.score * (1.0 - conf));
            });
        });
        const sorted = results.sort((a,b) => b.score - a.score).filter(c => c.score > 0.001);
        countLabel.innerText = `${sorted.length} Suspects Remaining`;
        listContainer.innerHTML = sorted.map(c => {
            const pct = Math.round(c.score * 100);
            const color = pct > 70 ? '#10b981' : (pct > 30 ? '#f59e0b' : '#ef4444');
            return `<div class="od-country-row" style="opacity: ${Math.max(0.4, pct/100)}"><span>${c.name}</span><span class="od-score-pill" style="color: ${color}">${pct}%</span></div>`;
        }).join('') || '<div style="opacity:0.3; padding:24px; text-align:center">Reset engine to start.</div>';
    }

    /**
     * UI COMPONENTS
     */
    function renderClues() {
        const container = document.querySelector('.od-content');
        if (!container) return;
        container.innerHTML = '';
        STATE.rules.forEach(group => {
            const acc = document.createElement('div');
            acc.className = 'od-accordion';
            acc.innerHTML = `<div class="od-acc-header"><span>${group.category}</span><small style="opacity:0.4">${group.clues.length}</small></div><div class="od-acc-body"></div>`;
            const body = acc.querySelector('.od-acc-body');
            group.clues.forEach(clue => {
                const label = document.createElement('label');
                label.className = 'od-clue-item';
                label.innerHTML = `<input type="checkbox" data-clue-id="${clue.id}" ${STATE.activeClueIds.has(clue.id) ? 'checked' : ''}><span>${clue.aspect}</span>`;
                label.onmouseenter = (e) => showTooltip(e, clue);
                label.onmouseleave = hideTooltip;
                label.querySelector('input').addEventListener('click', (e) => {
                    if (e.target.checked) STATE.activeClueIds.add(clue.id);
                    else STATE.activeClueIds.delete(clue.id);
                    syncUI();
                });
                body.appendChild(label);
            });
            acc.querySelector('.od-acc-header').onclick = () => {
                const wasActive = body.classList.contains('active');
                document.querySelectorAll('.od-acc-body').forEach(b => b.classList.remove('active'));
                if(!wasActive) body.classList.add('active');
            };
            container.appendChild(acc);
        });
    }

    function renderActiveTags() {
        const container = document.querySelector('.od-active-container');
        if(!container) return; container.innerHTML = '';
        STATE.activeClueIds.forEach(id => {
            const rule = findRuleById(id);
            if(!rule) return;
            const tag = document.createElement('div'); tag.className = 'od-tag'; tag.innerText = rule.aspect;
            tag.onclick = () => { STATE.activeClueIds.delete(id); syncUI(); };
            container.appendChild(tag);
        });
    }

    /**
     * FUZZY SEARCH (3-LETTER MINIMUM)
     */
    function setupSearch() {
        const input = document.getElementById('od-global-search');
        const suggest = document.getElementById('od-suggestions');
        if(!input) return;
        input.oninput = (e) => {
            const val = e.target.value.toLowerCase().trim();
            if (val.length < 3) { suggest.style.display = 'none'; return; }
            const matches = [];
            STATE.rules.forEach(g => g.clues.forEach(c => { 
                const searchable = [c.aspect, g.category, c.description||""].join(' ').toLowerCase();
                if (searchable.includes(val)) matches.push({...c, category: g.category});
            }));
            if(matches.length > 0) {
                suggest.innerHTML = matches.slice(0, 10).map(m => `<div class="od-suggestion-item" data-id="${m.id}"><div style="font-size:0.6rem; color:#60a5fa; opacity:0.6; text-transform:uppercase">${m.category}</div><div>${m.aspect}</div></div>`).join('');
                suggest.style.display = 'block';
            } else suggest.style.display = 'none';
        };
        suggest.onclick = (e) => {
            const item = e.target.closest('.od-suggestion-item');
            if(item) { STATE.activeClueIds.add(item.dataset.id); input.value = ''; suggest.style.display = 'none'; syncUI(); }
        };
        document.addEventListener('mousedown', (e) => { if(!input.contains(e.target)) suggest.style.display = 'none'; });
    }

    function findRuleById(id) { let r = null; STATE.rules.forEach(g => { const found = g.clues.find(c => c.id === id); if(found) r = found; }); return r; }
    function showTooltip(e, clue) {
        const tt = document.getElementById('od-tooltip');
        if(!clue.description && !clue.image) return;
        tt.style.display = 'block';
        tt.innerHTML = `${clue.image ? `<img src="${clue.image}" class="od-tooltip-img">` : ''}<div>${clue.description || ""}</div>`;
        tt.style.top = (e.clientY + 20) + 'px'; tt.style.left = (e.clientX - 260) + 'px';
    }
    function hideTooltip() { document.getElementById('od-tooltip').style.display = 'none'; }

    async function init() {
        STATE.countries = [
            {"id":"al","name":"Albania","continent":"Europe"},{"id":"at","name":"Austria","continent":"Europe"},{"id":"be","name":"Belgium","continent":"Europe"},{"id":"bg","name":"Bulgaria","continent":"Europe"},{"id":"hr","name":"Croatia","continent":"Europe"},{"id":"cz","name":"Czechia","continent":"Europe"},{"id":"dk","name":"Denmark","continent":"Europe"},{"id":"ee","name":"Estonia","continent":"Europe"},{"id":"fi","name":"Finland","continent":"Europe"},{"id":"fr","name":"France","continent":"Europe"},{"id":"de","name":"Germany","continent":"Europe"},{"id":"gr","name":"Greece","continent":"Europe"},{"id":"hu","name":"Hungary","continent":"Europe"},{"id":"is","name":"Iceland","continent":"Europe"},{"id":"ie","name":"Ireland","continent":"Europe"},{"id":"it","name":"Italy","continent":"Europe"},{"id":"lv","name":"Latvia","continent":"Europe"},{"id":"lt","name":"Lithuania","continent":"Europe"},{"id":"nl","name":"Netherlands","continent":"Europe"},{"id":"no","name":"Norway","continent":"Europe"},{"id":"pl","name":"Poland","continent":"Europe"},{"id":"pt","name":"Portugal","continent":"Europe"},{"id":"ro","name":"Romania","continent":"Europe"},{"id":"ru","name":"Russia","continent":"Asia"},{"id":"sk","name":"Slovakia","continent":"Europe"},{"id":"es","name":"Spain","continent":"Europe"},{"id":"se","name":"Sweden","continent":"Europe"},{"id":"ch","name":"Switzerland","continent":"Europe"},{"id":"tr","name":"Turkey","continent":"Europe"},{"id":"uk","name":"United Kingdom","continent":"Europe"},{"id":"us","name":"United States","continent":"North America"},{"id":"ca","name":"Canada","continent":"North America"},{"id":"mx","name":"Mexico","continent":"North America"},{"id":"br","name":"Brazil","continent":"South America"},{"id":"ar","name":"Argentina","continent":"South America"},{"id":"cl","name":"Chile","continent":"South America"},{"id":"za","name":"South Africa","continent":"Africa"},{"id":"au","name":"Australia","continent":"Oceania"},{"id":"nz","name":"New Zealand","continent":"Oceania"}
        ];

        STATE.rules = [
            { "category": "Global Essentials", "clues": [ 
                { "id":"g1", "aspect":"Driving Side: Left", "confidence":1.0, "excludeRegions":["Mainland Europe"], "excludeContinents":["North America","South America"] },
                { "id":"g2", "aspect":"Driving Side: Right", "confidence":1.0, "excludeCountries":["UK","IE","AU","NZ","ZA","JP","MY","ID","TH"] }
            ]},
            { "category": "Flora & Visual Botany", "clues": [ 
                { "id":"t1", "aspect":"Jacaranda (Violet)", "description":"Lush violet flowers.", "image":"https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Jacaranda_mimosifolia_flowers.jpg/1024px-Jacaranda_mimosifolia_flowers.jpg", "excludeContinents":["Europe"], "confidence":0.8 }
            ]}
        ];

        GM_addStyle(STYLES);
        const panel = document.createElement('div');
        panel.id = 'od-v2-panel';
        panel.innerHTML = `
            <div class="od-header">
                <div class="od-header-main"><span class="od-badge">Geographic Advisor v1.0.0</span><h1 class="od-title">OpenDeduce</h1></div>
                <div class="od-controls">
                    <div class="od-control-btn od-reset-btn" id="od-reset-btn" title="Reset">🔄</div>
                    <div class="od-control-btn" id="od-minimize-btn" title="Minimise">—</div>
                </div>
            </div>
            <div id="od-hud-body">
                <div class="od-search-container"><input type="text" id="od-global-search" class="od-input" placeholder="Type 3+ letters..."><div id="od-suggestions" class="od-suggestions"></div></div>
                <div class="od-active-container"></div>
                <div class="od-content"></div>
                <div class="od-results"><div class="od-res-header"><span id="od-suspect-count">Calculating...</span><span>Likelihood</span></div><div class="od-country-list"></div></div>
            </div>`;
        document.body.appendChild(panel);
        const tt = document.createElement('div'); tt.id = 'od-tooltip'; document.body.appendChild(tt);
        document.getElementById('od-reset-btn').addEventListener('click', () => { STATE.activeClueIds.clear(); syncUI(); });
        document.getElementById('od-minimize-btn').addEventListener('click', () => {
            panel.classList.toggle('minimized');
            document.getElementById('od-hud-body').style.display = panel.classList.contains('minimized') ? 'none' : 'block';
        });
        setupDragAndDrop(panel); renderClues(); updateSuspects(); setupSearch();
    }
    init();
})();
