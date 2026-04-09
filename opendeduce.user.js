// ==UserScript==
// @name         OpenDeduce
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Geo-Deduction Engine v1.0.0 - Forensic Rebuild 501-1000 with Equal-Slice Bayesian Scoring.
// @author       OpenDeduce Team
// @match        https://openguessr.com/*
// @updateURL    https://raw.githack.com/AwesomeOddEven-NightKeys-LunarBlink/OpenDeduce_OpenGuessr-Advisor/main/opendeduce.user.js
// @downloadURL  https://raw.githack.com/AwesomeOddEven-NightKeys-LunarBlink/OpenDeduce_OpenGuessr-Advisor/main/opendeduce.user.js
// @resource     DATABASE https://raw.githack.com/AwesomeOddEven-NightKeys-LunarBlink/OpenDeduce_OpenGuessr-Advisor/main/rules.json
// @grant        GM_addStyle
// @grant        GM_getResourceText
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        TRUST: {
            "Infrastructure": 0.98,
            "License Plates": 0.95,
            "Bollards": 0.90,
            "European Bollards": 0.92,
            "Road Markings": 0.90,
            "Utility Poles": 0.88,
            "Language & Script": 0.95,
            "Google Car Meta": 0.98,
            "Phone Codes": 0.99,
            "Internet TLDs": 0.99,
            "Surgical Infrastructure": 0.95,
            "Advanced Urbanisms & Paving Systems Block": 0.85,
            "Commercial Logistics & Shopfront Archetypes Block": 0.80,
            "Social & Cultural Markers Block": 0.75,
            "Advanced Physical Geography & Atmospheric Conditions Block": 0.40,
            "Environmental & Nature Block": 0.35,
            "Landscape": 0.45,
            "default": 0.50
        },
        PENALTY_FLOOR: 0.001 // 0.1% floor instead of hard zero
    };

    const STATE = {
        countries: [],
        rules: [],
        activeClueIds: new Set(),
        searchQuery: "",
        pos: JSON.parse(localStorage.getItem('od_pos') || '{"top":20,"left":null,"right":20}'),
        isMinimized: localStorage.getItem('od_min') === 'true'
    };

    /**
     * STYLESHEET
     */
    const STYLES = `
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&family=JetBrains+Mono:wght@700&display=swap');
        #od-panel { position: fixed; width:360px; max-height: 90vh; background: rgba(18,18,22, 0.98); backdrop-filter: blur(40px) saturate(200%); border: 1px solid rgba(255,255,255, 0.15); border-radius: 30px; color: #f8fafc; font-family: 'Plus Jakarta Sans', sans-serif; z-index: 10000; box-shadow: 0 40px 120px #000; display: flex; flex-direction: column; box-sizing: border-box; }
        #od-panel.minimized { max-height: 78px; overflow: hidden; }
        #od-panel * { box-sizing: border-box; }
        .od-header { padding: 22px 28px; border-bottom: 1px solid #ffffff11; cursor: move; display: flex; justify-content: space-between; align-items: center; }
        .od-title-grp { display: flex; flex-direction: column; max-width: 200px; }
        .od-badge { font-family: 'JetBrains Mono'; font-size: 0.6rem; color: #60a5fa; text-transform: uppercase; letter-spacing: 0.12em; }
        .od-title { font-size: 1.62rem; font-weight: 800; background: linear-gradient(135deg, #60a5fa, #c084fc, #f472b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; letter-spacing: -0.04em; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .od-controls { display: flex; gap: 10px; }
        .od-btn { background: #ffffff08; border: 1px solid #ffffff11; border-radius: 12px; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: 0.2s; }
        .od-btn:hover { background: #60a5fa22; transform: translateY(-2px); }
        .od-search-box { padding: 18px 24px; position: relative; }
        .od-input { width: 100%; background: #000; border: 1px solid #ffffff22; border-radius: 16px; padding: 12px 18px; color: #fff; font-size: 10pt; outline: none; }
        .od-suggestions { 
            position: absolute; top: 100%; left: 24px; right: 24px; background: #121218; 
            border: 1px solid #ffffff33; border-radius: 20px; max-height: 320px; 
            overflow-y: auto; z-index: 10001; display: none; margin-top: 8px; 
            box-shadow: 0 20px 60px #000;
        }
        .od-suggestion-item { padding: 16px 20px; cursor: pointer; border-bottom: 1px solid #ffffff05; font-size: 0.88rem; overflow-wrap: anywhere; }
        .od-suggestion-item:hover { background: #60a5fa22; padding-left: 24px; }
        .od-active-bar { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 24px 18px; }
        .od-tag { 
            background: rgba(96,165,250, 0.1); color: #60a5fa; font-size: 0.68rem; 
            padding: 5px 14px; border: 1px solid rgba(96,165,250, 0.3); border-radius: 12px; 
            cursor: pointer; font-weight: 800; transition: 0.2s; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .od-tag:hover { color: #f87171; border-color: #f87171; background: rgba(248,113,113, 0.1); }
        .od-content { flex: 1; overflow-y: auto; padding: 0 20px 20px; display: none; }
        .od-accordion { margin-bottom: 12px; border-radius: 20px; background: #ffffff03; border: 1px solid #ffffff11; overflow: hidden; }
        .od-clue-item { display: grid; grid-template-columns: 24px 1fr 24px; align-items: center; gap: 12px; padding: 14px; font-size: 0.92rem; cursor: pointer; color: #cbd5e1; transition: 0.2s; }
        .od-clue-item span { overflow-wrap: anywhere; line-height: 1.4; }
        .od-clue-item:hover { color: #60a5fa; background: #ffffff05; }
        .od-footer { padding: 22px 28px; background: #000; border-top: 1px solid #ffffff11; border-radius: 0 0 30px 30px; }
        .od-res-meta { display: flex; justify-content: space-between; font-size: 0.65rem; font-weight: 800; opacity: 0.4; text-transform: uppercase; margin-bottom: 12px; }
        .od-meter-wrap { width: 100%; height: 6px; background: #ffffff05; border-radius: 10px; margin-bottom: 20px; overflow: hidden; }
        .od-meter-fill { height: 100%; background: linear-gradient(90deg, #60a5fa, #c084fc); transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
        .od-suspect-list { max-height: 200px; overflow-y: auto; scrollbar-width: thin; }
        .od-suspect-row { display: flex; justify-content: space-between; padding: 10px 8px; border-radius: 12px; font-size: 0.95rem; margin-bottom: 4px; transition: 0.2s; }
        .od-score { font-family: 'JetBrains Mono'; font-weight: 800; color: #10b981; }
        .od-advice-box { padding: 12px 24px; font-size: 0.75rem; border-top: 1px solid #ffffff08; background: #ffffff03; color: #94a3b8; }
        .od-advice-tag { color: #60a5fa; font-weight: 800; cursor: pointer; }
        .od-preview-icon { 
            opacity: 0.8; transition: 0.2s; cursor: pointer; padding: 4px 8px; border-radius: 8px; 
            background: rgba(96,165,250, 0.2); border: 1px solid rgba(96,165,250, 0.4);
            font-size: 0.65rem; color: #fff; display: flex; align-items: center; gap: 4px;
        }
        .od-preview-icon:hover { opacity: 1; transform: scale(1.05); background: #60a5fa44; border-color: #60a5fa; }
        .od-preview-icon::before { content: "📷"; font-size: 0.8rem; }
        #od-modal { 
            position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
            background: rgba(0,0,0,0.85); backdrop-filter: blur(10px);
            z-index: 10005; display: none; align-items: center; justify-content: center;
        }
        .od-modal-content { 
            background: #121218; border: 1px solid #ffffff33; border-radius: 30px;
            padding: 24px; box-shadow: 0 40px 120px #000; max-width: 90vw; max-height: 90vh;
            display: flex; flex-direction: column; align-items: center; position: relative;
        }
        .od-modal-content img { max-width: 100%; max-height: 70vh; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .od-modal-close { position: absolute; top: 20px; right: 20px; font-size: 1.5rem; color: #fff; cursor: pointer; opacity: 0.6; }
        .od-modal-close:hover { opacity: 1; }
        .od-conflict-banner { 
            margin: 0 24px 18px; padding: 12px 18px; background: rgba(239, 68, 68, 0.15); 
            border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 16px; color: #f87171;
            font-size: 0.75rem; font-weight: 700; display: none; animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
        }
        @keyframes shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 0, 0); } 40%, 60% { transform: translate3d(4px, 0, 0); } }
    `;

    /**
     * EQUAL-SLICE REDISTRIBUTION LOGIC
     */
    function updateScoring() {
        const container = document.querySelector('.od-suspect-list'), meter = document.getElementById('od-meter'), countText = document.getElementById('od-count');
        if (!container) return;

        // Base weight: 1.0 for all countries
        const suspects = STATE.countries.map(c => ({...c, weight: 1.0}));

        STATE.activeClueIds.forEach(id => {
            let rule = null, category = "default"; 
            STATE.rules.forEach(g => { 
                const found = g.clues.find(c=>c.id===id); 
                if(found) { rule = found; category = g.category; }
            });
            if (!rule) return;

            const trust = CONFIG.TRUST[category] || CONFIG.TRUST.default;

            suspects.forEach(s => {
                const countryId = s.id.toUpperCase();
                let evidenceScore = 1.0;

                // 1. Soft-Boost Logic (bayesian weight)
                if (rule.likelyCountries?.length > 0) {
                    evidenceScore = rule.likelyCountries.includes(countryId) ? (1 + trust * 10) : (1 - trust * 0.5);
                }

                // 2. Hard-Lock Simulation (as requested: 0.1% instead of hard 0)
                let isMatch = true;
                if (rule.onlyCountries?.length > 0 && !rule.onlyCountries.includes(countryId)) isMatch = false;
                if (rule.onlyContinents?.length > 0 && !rule.onlyContinents.includes(s.continent)) isMatch = false;
                if (rule.excludeCountries?.length > 0 && rule.excludeCountries.includes(countryId)) isMatch = false;
                if (rule.excludeContinents?.length > 0 && rule.excludeContinents.includes(s.continent)) isMatch = false;

                if (!isMatch) evidenceScore = CONFIG.PENALTY_FLOOR;

                // 3. Narrowness Factor (Specificity Multiplier)
                // Rules that match fewer people are more "valuable"
                const specCount = (rule.onlyCountries?.length || rule.likelyCountries?.length || 50);
                const specBonus = Math.max(1, 5 / specCount); // Up to 5x pull for very narrow clues
                
                s.weight *= (evidenceScore * specBonus);
            });
        });

        // Proportional Normalization for Conflicts
        const totalWeight = suspects.reduce((acc, s) => acc + s.weight, 0);
        
        // Conflict Detection (Simple version for UI)
        checkConflict(suspects);

        const sorted = suspects.map(s => ({
            ...s,
            prob: totalWeight > 0 ? (s.weight / totalWeight) * 100 : 0
        })).sort((a,b) => b.prob - a.prob);

        // Confidence Calculation (Gap between #1 and #2)
        const confidence = (sorted.length > 1) ? (sorted[0].prob - sorted[1].prob) : sorted[0].prob;
        countText.innerHTML = `${sorted.filter(s=>s.prob > 1).length} Suspects | <span style="color:${confidence > 30 ? '#10b981' : '#f59e0b'}">Conf: ${Math.round(confidence)}%</span>`;
        
        const survivors = sorted.filter(s => s.prob > 0).length;
        meter.style.width = ((survivors / STATE.countries.length) * 100) + '%';

        container.innerHTML = sorted.map(s => {
            const opacity = s.prob > 0 ? Math.max(0.4, s.prob/100) : 0.2;
            return `<div class="od-suspect-row" style="opacity:${opacity}"><span>${s.name}</span><span class="od-score">${Math.round(s.prob)}%</span></div>`;
        }).join('');
    }

    function setupSearch() {
        const i = document.getElementById('od-search'), s = document.getElementById('od-suggest'), c = document.getElementById('od-content');
        i.oninput = (e) => {
            const v = e.target.value.toLowerCase().trim();
            if(v.length < 3) { s.style.display = 'none'; c.style.display = 'none'; return; }
            let matches = [];
            STATE.rules.forEach(g => {
                const catMatch = g.category.toLowerCase().includes(v);
                g.clues.forEach(cl => { if (catMatch || cl.aspect.toLowerCase().includes(v)) matches.push({...cl, category: g.category}); });
            });
            if(matches.length > 0) {
                s.innerHTML = matches.slice(0, 15).map(m => `
                    <div class="od-suggestion-item" data-id="${m.id}" data-img="${m.img||''}">
                        <div style="font-size:0.6rem; color:#60a5fa; display:flex; justify-content:space-between; align-items:center;">
                            <span>${m.category}</span>
                            ${m.img ? '<span class="od-preview-icon">VIEW</span>' : ''}
                        </div>
                        ${m.aspect}
                    </div>`).join('');
                s.style.display='block'; c.style.display='block'; renderAccordion(v);
                setupTooltips();
            } else { s.style.display='none'; c.style.display='none'; }
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
            clues.forEach(cl => {
                const l = document.createElement('label'); l.className = 'od-clue-item';
                l.dataset.img = cl.img || '';
                l.innerHTML = `
                    <input type="checkbox" data-clue-id="${cl.id}" ${STATE.activeClueIds.has(cl.id)?'checked':''}>
                    <span>${cl.aspect}</span>
                    ${cl.img ? '<span class="od-preview-icon">VIEW</span>' : '<span></span>'}
                `;
                l.querySelector('input').onclick = (ev) => { if(ev.target.checked) STATE.activeClueIds.add(cl.id); else STATE.activeClueIds.delete(cl.id); syncUI(); };
                b.appendChild(l);
            });
            container.appendChild(acc);
        });
        setupModalListeners();
    }

    function checkConflict(suspects) {
        const banner = document.getElementById('od-conflict');
        if (!banner) return;
        
        // A conflict is defined here as "Zero high-probability suspects remaining" 
        // while active clues are selected.
        const survivors = suspects.filter(s => s.weight > 0.01).length;
        if (STATE.activeClueIds.size > 1 && survivors === 0) {
            banner.style.display = 'block';
            banner.innerText = "🚨 Logic Conflict! No country matches all selected forensic markers perfectly.";
        } else {
            banner.style.display = 'none';
        }
    }

    function setupModalListeners() {
        const modal = document.getElementById('od-modal');
        const img = modal.querySelector('img');
        
        document.querySelectorAll('.od-preview-icon').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                const clueItem = btn.closest('[data-img]');
                if (clueItem && clueItem.dataset.img) {
                    img.src = clueItem.dataset.img;
                    modal.style.display = 'flex';
                }
            };
        });

        modal.onclick = (e) => { if (e.target === modal || e.target.classList.contains('od-modal-close')) modal.style.display = 'none'; };
    }

    function syncUI() {
        document.querySelectorAll('.od-clue-item input').forEach(i => i.checked = STATE.activeClueIds.has(i.dataset.clueId));
        const bar = document.querySelector('.od-active-bar'); bar.innerHTML = '';
        STATE.activeClueIds.forEach(id => {
            let r=null; STATE.rules.forEach(g=>{ const f=g.clues.find(cl=>cl.id===id); if(f) r=f; });
            if(!r) return;
            const t = document.createElement('div'); t.className = 'od-tag'; t.innerText = r.aspect;
            t.onclick = () => { STATE.activeClueIds.delete(id); syncUI(); };
            bar.appendChild(t);
        });
        updateScoring();
        updateAdvice(bar);
    }

    function updateAdvice(activeBar) {
        const adviceContainer = document.getElementById('od-advice');
        if (!adviceContainer) return;

        const currentSuspects = Array.from(document.querySelectorAll('.od-suspect-row'))
            .filter(r => parseFloat(r.querySelector('.od-score').innerText) > 1)
            .map(r => r.querySelector('span').innerText);

        if (currentSuspects.length <= 1 || currentSuspects.length > 50) {
            adviceContainer.style.display = 'none';
            return;
        }

        // Calculate entropy: find category with most varying clues for remaining suspects
        let bestCat = "", maxGain = 0;
        STATE.rules.forEach(g => {
            const usefulClues = g.clues.filter(c => !STATE.activeClueIds.has(c.id));
            if (usefulClues.length > maxGain) {
                maxGain = usefulClues.length;
                bestCat = g.category;
            }
        });

        adviceContainer.style.display = 'block';
        adviceContainer.innerHTML = `Best next move: Look for <span class="od-advice-tag">${bestCat}</span> clues.`;
        adviceContainer.querySelector('.od-advice-tag').onclick = () => {
            const input = document.getElementById('od-search');
            input.value = bestCat;
            input.dispatchEvent(new Event('input'));
        };
    }

    function exportTrace() {
        const suspects = Array.from(document.querySelectorAll('.od-suspect-row'))
            .slice(0, 3)
            .map(r => `${r.querySelector('span').innerText} (${r.querySelector('.od-score').innerText})`)
            .join(', ');
        
        const clues = Array.from(STATE.activeClueIds)
            .map(id => {
                let found = ""; STATE.rules.forEach(g => { const c = g.clues.find(cl=>cl.id===id); if(c) found = c.aspect; });
                return found;
            }).join(' + ');

        const report = `OpenDeduce Forensic Trace:\nLogic: ${clues || 'None'}\nSuspects: ${suspects}\nVerified at: ${new Date().toLocaleTimeString()}`;
        navigator.clipboard.writeText(report);
        alert("Forensic Trace copied to clipboard!");
    }

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

    async function init() {
        const data = GM_getResourceText("DATABASE");
        if(data) {
            const db = JSON.parse(data);
            STATE.countries = db.countries;
            STATE.rules = db.rules;
        }

        GM_addStyle(STYLES);
        const p = document.createElement('div'); p.id = 'od-panel';
        p.style.top = STATE.pos.top + 'px'; p.style.left = STATE.pos.left !== null ? STATE.pos.left + 'px' : 'auto'; p.style.right = STATE.pos.right !== 'auto' ? STATE.pos.right + 'px' : 'auto';
        if(STATE.isMinimized) p.classList.add('minimized');
        p.innerHTML = `
            <div class="od-header"><div class="od-title-grp"><span class="od-badge">Scalpel v1.1.0</span><h1 class="od-title">OpenDeduce</h1></div>
            <div class="od-controls"><div class="od-btn" id="od-export" title="Export Trace">📋</div><div class="od-btn" id="od-reset">🔄</div><div class="od-btn" id="od-min">—</div></div></div>
            <div id="od-hud-body" style="display:${STATE.isMinimized?'none':'block'}">
                <div class="od-search-box"><input type="text" id="od-search" class="od-input" placeholder="Search Rules 1,000+ Forensic Clues...">
                <div id="od-suggest" class="od-suggestions"></div></div>
                <div id="od-conflict" class="od-conflict-banner"></div>
                <div class="od-active-bar"></div>
                <div id="od-advice" class="od-advice-box"></div>
                <div class="od-content" id="od-content"></div>
                <div class="od-footer"><div class="od-res-meta"><span id="od-count">Calibrating Forensic Matrix...</span><span>Prob. Density</span></div>
                <div class="od-meter-wrap"><div class="od-meter-fill" id="od-meter"></div></div><div class="od-suspect-list"></div></div>
            </div>
            <div id="od-modal"><div class="od-modal-content"><span class="od-modal-close">&times;</span><img></div></div>`;
        document.body.appendChild(p);
        document.getElementById('od-reset').onclick = () => { STATE.activeClueIds.clear(); syncUI(); };
        document.getElementById('od-export').onclick = exportTrace;
        document.getElementById('od-min').onclick = () => { p.classList.toggle('minimized'); STATE.isMinimized = p.classList.contains('minimized'); document.getElementById('od-hud-body').style.display = STATE.isMinimized?'none':'block'; localStorage.setItem('od_min', STATE.isMinimized); };
        setupDrag(p); setupSearch(); syncUI();
    }
    init();
})();
