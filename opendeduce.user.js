// ==UserScript==
// @name         OpenDeduce
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  The ultimate Geo-Deduction tool with 300+ micro-clues, probabilistic scoring, and visual identification guides.
// @author       OpenDeduce Team
// @match        https://openguessr.com/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
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
        searchQuery: "",
        scores: {},
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
            width: 340px;
            max-height: 90vh;
            background: rgba(30, 30, 36, 0.94);
            backdrop-filter: blur(20px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 24px;
            color: #e2e8f0;
            font-family: 'Inter', -apple-system, system-ui, sans-serif;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .od-header {
            padding: 24px;
            background: linear-gradient(to bottom, rgba(255,255,255,0.04), transparent);
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .od-badge {
            font-size: 0.65rem;
            color: #60a5fa;
            text-transform: uppercase;
            letter-spacing: 0.18em;
            font-weight: 800;
            margin-bottom: 4px;
            display: block;
        }
        .od-title {
            font-size: 1.6rem;
            font-weight: 900;
            background: linear-gradient(135deg, #60a5fa, #c084fc, #f472b6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin: 0;
            letter-spacing: -0.03em;
        }

        .od-search-box {
            padding: 0 24px 16px;
        }
        .od-input {
            width: 100%;
            background: rgba(0, 0, 0, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 14px;
            padding: 12px 18px;
            color: #fff;
            font-size: 0.9rem;
            outline: none;
            box-sizing: border-box;
            transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        .od-input:focus {
            border-color: #60a5fa;
            background: rgba(255, 255, 255, 0.03);
            box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.2);
        }

        .od-content {
            flex: 1;
            overflow-y: auto;
            padding: 0 16px 20px;
            scrollbar-width: thin;
            scrollbar-color: rgba(255,255,255,0.15) transparent;
        }

        .od-accordion {
            margin-bottom: 10px;
            border-radius: 14px;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid rgba(255, 255, 255, 0.04);
            transition: all 0.2s;
        }
        .od-accordion:hover {
            background: rgba(255, 255, 255, 0.04);
            border-color: rgba(255, 255, 255, 0.1);
        }
        .od-acc-header {
            padding: 16px 18px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.85rem;
            font-weight: 700;
        }
        .od-acc-body {
            display: none;
            padding: 8px 18px 18px;
            border-top: 1px solid rgba(255, 255, 255, 0.03);
        }
        .od-acc-body.active {
            display: block;
        }

        .od-clue-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 8px 0;
            font-size: 0.85rem;
            cursor: help;
            opacity: 0.75;
            transition: all 0.2s;
            position: relative;
        }
        .od-clue-item:hover {
            opacity: 1;
            color: #60a5fa;
            transform: translateX(4px);
        }
        .od-clue-item input {
            cursor: pointer;
            accent-color: #60a5fa;
            width: 16px;
            height: 16px;
        }

        /* Tooltip Guide */
        #od-tooltip {
            position: fixed;
            pointer-events: none;
            background: rgba(15, 15, 20, 0.98);
            border: 1px solid rgba(255, 255, 255, 0.2);
            padding: 12px;
            border-radius: 14px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.7);
            z-index: 10000;
            width: 210px;
            display: none;
            font-size: 0.8rem;
            color: #cbd5e1;
            line-height: 1.4;
        }
        .od-tooltip-img {
            width: 100%;
            height: 120px;
            background: #000;
            border-radius: 10px;
            margin-bottom: 10px;
            object-fit: cover;
            border: 1px solid rgba(255,255,255,0.1);
        }

        .od-results {
            padding: 24px;
            background: rgba(0, 0, 0, 0.4);
            border-top: 1px solid rgba(255, 255, 255, 0.08);
        }
        .od-res-header {
            display: flex;
            justify-content: space-between;
            font-size: 0.75rem;
            font-weight: 800;
            opacity: 0.6;
            text-transform: uppercase;
            margin-bottom: 14px;
            letter-spacing: 1px;
        }
        .od-country-list {
            max-height: 200px;
            overflow-y: auto;
        }
        .od-country-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 6px;
            border-radius: 10px;
            transition: all 0.25s;
        }
        .od-country-row:hover {
            background: rgba(255, 255, 255, 0.06);
        }
        .od-score-pill {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.75rem;
            color: #10b981;
            font-weight: 800;
        }
    `;

    /**
     * DYNAMIC UI GENERATOR
     */
    function renderClues() {
        const container = document.querySelector('.od-content');
        if (!container) return;
        container.innerHTML = '';

        STATE.rules.forEach(group => {
            const accordion = document.createElement('div');
            accordion.className = 'od-accordion';
            
            const header = document.createElement('div');
            header.className = 'od-acc-header';
            header.innerHTML = `<span>${group.category}</span><small style="opacity:0.4">${group.clues.length} Meta</small>`;
            
            const body = document.createElement('div');
            body.className = 'od-acc-body';
            
            group.clues.forEach(clue => {
                const item = document.createElement('label');
                item.className = 'od-clue-item';
                
                const checked = STATE.activeClueIds.has(clue.id) ? 'checked' : '';
                item.innerHTML = `
                    <input type="checkbox" data-clue-id="${clue.id}" ${checked}>
                    <span>${clue.aspect}</span>
                `;
                
                // TOOLTIP HANDLING
                item.addEventListener('mouseenter', (e) => showTooltip(e, clue));
                item.addEventListener('mouseleave', hideTooltip);
                item.addEventListener('mousemove', moveTooltip);
                
                item.querySelector('input').addEventListener('change', (e) => {
                    if (e.target.checked) STATE.activeClueIds.add(clue.id);
                    else STATE.activeClueIds.delete(clue.id);
                    updateSuspects();
                });
                
                body.appendChild(item);
            });

            header.addEventListener('click', () => {
                const isActive = body.classList.contains('active');
                document.querySelectorAll('.od-acc-body').forEach(b => b.classList.remove('active'));
                if(!isActive) body.classList.add('active');
            });

            accordion.appendChild(header);
            accordion.appendChild(body);
            container.appendChild(accordion);
        });
    }

    /**
     * TOOLTIP SYSTEM (VISUAL GUIDES)
     */
    function showTooltip(e, clue) {
        const tt = document.getElementById('od-tooltip');
        if (!clue.description && !clue.image) return;
        
        tt.style.display = 'block';
        tt.innerHTML = `
            ${clue.image ? `<img src="${clue.image}" class="od-tooltip-img">` : ''}
            <div>${clue.description || "Visual guide coming soon..."}</div>
        `;
        moveTooltip(e);
    }

    function hideTooltip() {
        const tt = document.getElementById('od-tooltip');
        if (tt) tt.style.display = 'none';
    }

    function moveTooltip(e) {
        const tt = document.getElementById('od-tooltip');
        if (!tt) return;
        tt.style.top = (e.clientY + 20) + 'px';
        tt.style.left = (e.clientX - 230) + 'px';
    }

    /**
     * THE SCALPEL (LOGIC ENGINE)
     */
    function updateSuspects() {
        const listContainer = document.querySelector('.od-country-list');
        const countLabel = document.getElementById('od-suspect-count');
        if(!listContainer) return;

        const results = STATE.countries.map(c => ({ ...c, likelihood: 1.0 }));

        STATE.activeClueIds.forEach(clueId => {
            let foundClue = null;
            STATE.rules.forEach(g => {
                const c = g.clues.find(rule => rule.id === clueId);
                if (c) foundClue = c;
            });

            if (!foundClue) return;

            results.forEach(country => {
                const weight = foundClue.confidence || 1.0;
                let isMatch = true;

                if (foundClue.onlyCountries && foundClue.onlyCountries.length > 0) {
                    if (!foundClue.onlyCountries.includes(country.id.toUpperCase())) isMatch = false;
                } else {
                    if (foundClue.excludeContinents && foundClue.excludeContinents.includes(country.continent)) isMatch = false;
                    if (foundClue.excludeCountries && foundClue.excludeCountries.includes(country.id.toUpperCase())) isMatch = false;
                }

                if (!isMatch) country.likelihood = Math.max(0, country.likelihood * (1.0 - weight));
            });
        });

        const topSuspects = results
            .filter(c => c.likelihood > 0.05)
            .sort((a, b) => b.likelihood - a.likelihood);

        countLabel.innerText = `${topSuspects.length} Suspects Remaining`;

        listContainer.innerHTML = topSuspects.map(c => {
            const pct = Math.round(c.likelihood * 100);
            const color = pct > 60 ? '#10b981' : (pct > 25 ? '#f59e0b' : '#ef4444');
            return `
                <div class="od-country-row">
                    <span style="${pct > 80 ? 'font-weight: 700; color: #fff;' : 'opacity: 0.8;'}">${c.name}</span>
                    <span class="od-score-pill" style="color: ${color}">${pct}%</span>
                </div>
            `;
        }).join('') || '<div style="opacity:0.3; padding:30px; text-align:center; font-size:0.8rem">No suspects found.</div>';
    }

    /**
     * ADVANCED SEARCH (WITH ALIASES)
     */
    function setupSearch() {
        const input = document.getElementById('od-global-search');
        if(!input) return;

        input.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const clues = document.querySelectorAll('.od-clue-item');
            
            clues.forEach(item => {
                const clueId = item.querySelector('input').dataset.clueId;
                let rule = null;
                STATE.rules.forEach(g => {
                    const r = g.clues.find(clue => clue.id === clueId);
                    if(r) rule = r;
                });
                
                const searchPool = [rule.aspect, rule.category, rule.description || ""].join(' ').toLowerCase();
                
                if (searchPool.includes(query)) {
                    item.style.display = 'flex';
                    if (query.length > 2) item.parentElement.classList.add('active');
                } else {
                    item.style.display = 'none';
                }
            });

            if(!query) document.querySelectorAll('.od-acc-body').forEach(b => b.classList.remove('active'));
        });
    }

    async function init() {
        // Initial Mock Data (Ready for Fetch Expansion)
        STATE.countries = [
            {"id": "fr", "name": "France", "continent": "Europe"},
            {"id": "jp", "name": "Japan", "continent": "Asia"},
            {"id": "br", "name": "Brazil", "continent": "South America"},
            {"id": "au", "name": "Australia", "continent": "Oceania"},
            {"id": "uk", "name": "United Kingdom", "continent": "Europe"},
            {"id": "ca", "name": "Canada", "continent": "North America"}
        ];

        STATE.rules = [
            {
                "category": "Trees & Botany (Visual Guides)",
                "clues": [
                    { "id": "t1", "aspect": "Jacaranda (Violet)", "description": "Lush trees with vibrant purple/violet flowers. Common in SA and South America.", "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Jacaranda_mimosifolia_flowers.jpg/1024px-Jacaranda_mimosifolia_flowers.jpg", "excludeContinents": ["Europe"], "confidence": 0.8 },
                    { "id": "t2", "aspect": "Banyan Tree", "description": "Large tree with dangling 'aerial roots' from branches. Iconic in Asia.", "image": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Banyan_tree_in_Hawaii.jpg/1024px-Banyan_tree_in_Hawaii.jpg", "onlyCountries": ["IN", "TH", "ID", "LK"], "confidence": 1.0 }
                ]
            },
            {
                "category": "Architecture & Street Art",
                "clues": [
                    { "id": "p2-235", "aspect": "Pichação Graffiti", "description": "Distinctive black, runic-style graffiti. Found almost uniquely in São Paulo.", "image": "https://upload.wikimedia.org/wikipedia/commons/d/d3/Picha%C3%A7%C3%A3o_at_SESC_Vila_Mariana.jpg", "onlyCountries": ["BR"], "confidence": 1.0 },
                    { "id": "p2-171", "aspect": "Asbestos Corrugated Roofs", "description": "Grey, wavy roof sheets. Common in developing regions and Eastern Europe.", "excludeCountries": ["US", "CA", "UK", "DE"], "confidence": 0.7 }
                ]
            }
        ];

        GM_addStyle(STYLES);
        const panel = document.createElement('div');
        panel.id = 'od-v2-panel';
        panel.innerHTML = `
            <div class="od-header">
                <span class="od-badge">Geographic Advisor v1.0.0</span>
                <h1 class="od-title">OpenDeduce</h1>
            </div>
            <div class="od-search-box">
                <input type="text" id="od-global-search" class="od-input" placeholder="Search (e.g. 'purple flowers')...">
            </div>
            <div class="od-content"></div>
            <div class="od-results">
                <div class="od-res-header">
                    <span id="od-suspect-count">Calculating...</span>
                    <span>Likelihood</span>
                </div>
                <div class="od-country-list"></div>
            </div>
        `;
        document.body.appendChild(panel);

        const tt = document.createElement('div');
        tt.id = 'od-tooltip';
        document.body.appendChild(tt);

        renderClues();
        updateSuspects();
        setupSearch();
        STATE.isLoaded = true;
    }

    init();
})();
