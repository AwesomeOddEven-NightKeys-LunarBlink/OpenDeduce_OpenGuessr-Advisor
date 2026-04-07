// ==UserScript==
// @name         OpenDeduce
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Geo-Deduction advisor with Movable, Minimizable HUD and quick-reset functionality.
// @author       OpenDeduce Team
// @match        https://openguessr.com/*
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
        isDragging: false
    };

    /**
     * STYLESHEET
     */
    const STYLES = `
        #od-v2-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 340px;
            max-height: 90vh;
            background: rgba(30, 30, 36, 0.94);
            backdrop-filter: blur(20px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 24px;
            color: #f8fafc;
            font-family: 'Inter', -apple-system, system-ui, sans-serif;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
            transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        #od-v2-panel.minimized {
            max-height: 80px;
            overflow: hidden;
        }

        .od-header {
            padding: 20px 24px;
            background: rgba(255,255,255,0.03);
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            cursor: move; /* Drag handler */
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .od-header-main { display: flex; flex-direction: column; }
        .od-title { font-size: 1.4rem; font-weight: 900; background: linear-gradient(135deg, #60a5fa, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: -0.03em; margin: 0; }
        
        .od-controls { display: flex; gap: 12px; align-items: center; }
        .od-control-btn {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 8px;
            width: 28px; height: 28px;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer;
            font-size: 1rem;
            transition: all 0.2s;
        }
        .od-control-btn:hover { background: rgba(96, 165, 250, 0.2); border-color: #60a5fa; color: #60a5fa; }
        .od-reset-btn:hover { background: rgba(239, 68, 68, 0.2); border-color: #ef4444; color: #ef4444; }

        .od-search-container { padding: 16px 24px; position: relative; }
        .od-input { width: 100%; background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 12px; padding: 12px 16px; color: #fff; font-size: 0.9rem; outline: none; box-sizing: border-box; }

        .od-suggestions { position: absolute; top: 100%; left: 24px; right: 24px; background: #121212; border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 12px; max-height: 250px; overflow-y: auto; z-index: 100; display: none; margin-top: 5px; }
        .od-suggestion-item { padding: 10px 16px; font-size: 0.8rem; cursor: pointer; border-bottom: 1px solid rgba(255, 255, 255, 0.05); transition: background 0.2s; }
        .od-suggestion-item:hover { background: rgba(96, 165, 250, 0.15); }

        .od-active-container { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 24px 12px; }
        .od-tag { background: rgba(96, 165, 250, 0.15); color: #60a5fa; font-size: 0.72rem; padding: 6px 12px; border: 1px solid rgba(96, 165, 250, 0.3); border-radius: 10px; cursor: pointer; font-weight: 700; }
        .od-tag:hover { color: #ef4444; border-color: #ef4444; }

        .od-content { flex: 1; overflow-y: auto; padding: 0 16px 20px; scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.15) transparent; }
        .od-accordion { margin-bottom: 8px; border-radius: 14px; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.03); }
        .od-acc-header { padding: 14px 18px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; font-weight: 700; }
        .od-acc-body { display: none; padding: 8px 18px 16px; border-top: 1px solid rgba(255, 255, 255, 0.02); }
        .od-acc-body.active { display: block; }

        .od-results { padding: 20px 24px; background: rgba(0, 0, 0, 0.4); border-top: 1px solid rgba(255, 255, 255, 0.08); }
        .od-res-header { display: flex; justify-content: space-between; font-size: 0.72rem; font-weight: 800; opacity: 0.4; text-transform: uppercase; margin-bottom: 12px; }
        .od-country-list { max-height: 200px; overflow-y: auto; }
        .od-country-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 6px; border-radius: 8px; font-size: 0.85rem; }
        .od-score-pill { font-family: monospace; font-size: 0.72rem; font-weight: 800; min-width: 42px; text-align: right; }

        #od-tooltip { position: fixed; pointer-events: none; background: rgba(15, 15, 20, 0.98); border: 1px solid rgba(255, 255, 255, 0.2); padding: 12px; border-radius: 14px; z-index: 10000; width: 220px; display: none; color: #cbd5e1; }
        .od-tooltip-img { width: 100%; height: 120px; border-radius: 10px; margin-bottom: 10px; object-fit: cover; }
    `;

    /**
     * CORE LOGIC: DRAG & DROP
     */
    function setupDragAndDrop(el) {
        const header = el.querySelector('.od-header');
        let startX, startY;

        header.onmousedown = (e) => {
            if (e.target.closest('.od-controls')) return; 
            STATE.isDragging = true;
            startX = e.clientX - el.offsetLeft;
            startY = e.clientY - el.offsetTop;
            document.onmousemove = (e) => {
                if (!STATE.isDragging) return;
                el.style.left = (e.clientX - startX) + 'px';
                el.style.top = (e.clientY - startY) + 'px';
                el.style.right = 'auto'; 
            };
            document.onmouseup = () => { STATE.isDragging = false; };
        };
    }

    /**
     * ENGINE: SYNC & RESET
     */
    function resetEngine() {
        STATE.activeClueIds.clear();
        syncUI();
    }

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
        const list = STATE.countries.map(c => ({ ...c, score: 1.0 }));

        STATE.activeClueIds.forEach(clueId => {
            let rule = findRuleById(clueId);
            if (!rule) return;
            list.forEach(country => {
                const conf = rule.confidence || 1.0;
                let isMatch = true;
                if (rule.onlyCountries && !rule.onlyCountries.includes(country.id.toUpperCase())) isMatch = false;
                else {
                    if (rule.excludeContinents?.includes(country.continent)) isMatch = false;
                    if (rule.excludeCountries?.includes(country.id.toUpperCase())) isMatch = false;
                    if (rule.excludeRegions && rule.excludeRegions.includes("Mainland Europe")) {
                        if (country.continent === "Europe" && country.id !== "uk" && country.id !== "ie") isMatch = false;
                    }
                }
                if (!isMatch) country.score = Math.max(0, country.score * (1.0 - conf));
            });
        });

        const sorted = list.sort((a,b) => b.score - a.score).filter(c => c.score > 0.001);
        countLabel.innerText = `${sorted.length} Suspects Remaining`;
        listContainer.innerHTML = sorted.map(c => {
            const pct = Math.round(c.score * 100);
            return `<div class="od-country-row" style="opacity:${Math.max(0.4, pct/100)}"><span>${c.name}</span><span class="od-score-pill" style="color:${pct > 60 ? '#10b981' : '#f59e0b'}">${pct}%</span></div>`;
        }).join('') || '<div style="opacity:0.3; padding:20px; text-align:center">Reset and try again.</div>';
    }

    /**
     * UI RENDERING
     */
    function renderClues() {
        const container = document.querySelector('.od-content');
        if (!container) return;
        container.innerHTML = '';
        STATE.rules.forEach(group => {
            const acc = document.createElement('div');
            acc.className = 'od-accordion';
            acc.innerHTML = `<div class="od-acc-header"><span>${group.category}</span><small style="opacity:0.3">${group.clues.length}</small></div><div class="od-acc-body"></div>`;
            const body = acc.querySelector('.od-acc-body');
            group.clues.forEach(clue => {
                const label = document.createElement('label');
                label.className = 'od-clue-item';
                label.innerHTML = `<input type="checkbox" data-clue-id="${clue.id}" ${STATE.activeClueIds.has(clue.id) ? 'checked' : ''}><span>${clue.aspect}</span>`;
                label.onmouseenter = (e) => showTooltip(e, clue);
                label.onmouseleave = hideTooltip;
                label.querySelector('input').onchange = (e) => {
                    if (e.target.checked) STATE.activeClueIds.add(clue.id);
                    else STATE.activeClueIds.delete(clue.id);
                    syncUI();
                };
                body.appendChild(label);
            });
            acc.querySelector('.od-acc-header').onclick = () => { body.classList.toggle('active'); };
            container.appendChild(acc);
        });
    }

    function renderActiveTags() {
        const container = document.querySelector('.od-active-container');
        if (!container) return;
        container.innerHTML = '';
        STATE.activeClueIds.forEach(id => {
            const rule = findRuleById(id);
            if (!rule) return;
            const tag = document.createElement('div');
            tag.className = 'od-tag';
            tag.innerText = rule.aspect;
            tag.onclick = () => { STATE.activeClueIds.delete(id); syncUI(); };
            container.appendChild(tag);
        });
    }

    function setupSearch() {
        const input = document.getElementById('od-global-search');
        const suggest = document.getElementById('od-suggestions');
        if(!input) return;
        input.oninput = (e) => {
            const val = e.target.value.toLowerCase();
            if(!val) { suggest.style.display = 'none'; return; }
            const matches = [];
            STATE.rules.forEach(g => g.clues.forEach(c => { 
                const searchPool = [c.aspect, g.category, c.description||""].join(' ').toLowerCase();
                if(searchPool.includes(val)) matches.push(c); 
            }));
            if(matches.length > 0) {
                suggest.innerHTML = matches.slice(0, 8).map(m => `<div class="od-suggestion-item" data-id="${m.id}">${m.aspect}</div>`).join('');
                suggest.style.display = 'block';
            } else suggest.style.display = 'none';
        };
        suggest.onclick = (e) => {
            const item = e.target.closest('.od-suggestion-item');
            if(item) { STATE.activeClueIds.add(item.dataset.id); input.value = ''; suggest.style.display = 'none'; syncUI(); }
        };
        document.onclick = (e) => { if(!input.contains(e.target)) suggest.style.display = 'none'; };
    }

    function findRuleById(id) { let rule = null; STATE.rules.forEach(g => { const r = g.clues.find(c => c.id === id); if(r) rule = r; }); return rule; }
    function showTooltip(e, clue) {
        const tt = document.getElementById('od-tooltip');
        if(!clue.description && !clue.image) return;
        tt.style.display = 'block';
        tt.innerHTML = `${clue.image ? `<img src="${clue.image}" class="od-tooltip-img">` : ''}<div>${clue.description || ""}</div>`;
        tt.style.top = (e.clientY + 20) + 'px'; tt.style.left = (e.clientX - 230) + 'px';
    }
    function hideTooltip() { document.getElementById('od-tooltip').style.display = 'none'; }

    async function init() {
        // Full Country Master List Ready
        STATE.countries = [
            {"id": "al", "name": "Albania", "continent": "Europe"}, {"id": "ba", "name": "Bosnia and Herzegovina", "continent": "Europe"}, {"id": "be", "name": "Belgium", "continent": "Europe"}, {"id": "bg", "name": "Bulgaria", "continent": "Europe"}, {"id": "br", "name": "Brazil", "continent": "South America"}, {"id": "jp", "name": "Japan", "continent": "Asia"}, {"id": "au", "name": "Australia", "continent": "Oceania"}, {"id": "us", "name": "United States", "continent": "North America"}, {"id": "ca", "name": "Canada", "continent": "North America"}, {"id": "uk", "name": "United Kingdom", "continent": "Europe"}, {"id": "fr", "name": "France", "continent": "Europe"}, {"id": "de", "name": "Germany", "continent": "Europe"}
        ];

        STATE.rules = [
            { "category": "Global Orientation", "clues": [ { "id": "g-left", "aspect": "Driving Side: Left", "confidence": 1.0, "excludeRegions": ["Mainland Europe"], "excludeContinents": ["North America"] } ] },
            { "category": "Trees & Botany", "clues": [ { "id": "t1", "aspect": "Jacaranda (Purple)", "description": "Lush trees with vibrant purple/violet flowers.", "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Jacaranda_mimosifolia_flowers.jpg/1024px-Jacaranda_mimosifolia_flowers.jpg", "excludeContinents": ["Europe"], "confidence": 0.8 } ] }
        ];

        GM_addStyle(STYLES);
        const panel = document.createElement('div');
        panel.id = 'od-v2-panel';
        panel.innerHTML = `
            <div class="od-header">
                <div class="od-header-main"><span class="od-badge">Advisor v1.0.0</span><h1 class="od-title">OpenDeduce</h1></div>
                <div class="od-controls">
                    <div class="od-control-btn od-reset-btn" id="od-reset-btn" title="Reset Engine">🔄</div>
                    <div class="od-control-btn" id="od-minimize-btn" title="Toggle HUD">—</div>
                </div>
            </div>
            <div id="od-hud-body">
                <div class="od-search-container"><input type="text" id="od-global-search" class="od-input" placeholder="Search clues (e.g. 'purple')...">
                <div id="od-suggestions" class="od-suggestions"></div></div>
                <div class="od-active-container"></div>
                <div class="od-content"></div>
                <div class="od-results"><div class="od-res-header"><span id="od-suspect-count">Calculating...</span><span>Likelihood</span></div><div class="od-country-list"></div></div>
            </div>`;
        document.body.appendChild(panel);
        
        const tt = document.createElement('div'); tt.id = 'od-tooltip'; document.body.appendChild(tt);

        document.getElementById('od-reset-btn').onclick = resetEngine;
        document.getElementById('od-minimize-btn').onclick = () => {
            panel.classList.toggle('minimized');
            document.getElementById('od-hud-body').style.display = panel.classList.contains('minimized') ? 'none' : 'block';
        };

        setupDragAndDrop(panel);
        renderClues();
        updateSuspects();
        setupSearch();
    }

    init();
})();
