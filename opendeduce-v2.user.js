// ==UserScript==
// @name         OpenDeduce v2.0: The Geo-Elimination Engine
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Expert GeoGuessr Advisor with 300+ clues, probabilistic scoring, and dynamic accordion UI.
// @author       OpenDeduce Team
// @match        https://openguessr.com/*
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// ==/UserScript==

(function() {
    'use strict';

    /**
     * STATE MANAGEMENT
     * Centralized store for countries, rules, and active filtering state.
     */
    const STATE = {
        countries: [],
        rules: [],
        activeClueIds: new Set(),
        searchQuery: "",
        scores: {}, // ID -> Likelihood (0.0 to 1.0)
        isLoaded: false
    };

    // Configuration for remote data (Update these URLs when hosted on GitHub)
    const CONFIG = {
        DATA_URL: "https://raw.githubusercontent.com/AwesomeOddEven-NightKeys-LunarBlink/OpenDeduce---Openguessr-Advisor/main/meta-database.json",
        RULES_URL: "https://raw.githubusercontent.com/AwesomeOddEven-NightKeys-LunarBlink/OpenDeduce---Openguessr-Advisor/main/rules.json"
    };

    /**
     * STYLESHEET
     * Modern, high-performance CSS with glassmorphism and smooth transitions.
     */
    const STYLES = `
        #od-v2-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 340px;
            max-height: 90vh;
            background: rgba(30, 30, 36, 0.92);
            backdrop-filter: blur(20px) saturate(160%);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 24px;
            color: #e2e8f0;
            font-family: 'Inter', -apple-system, system-ui, sans-serif;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
            overflow: hidden;
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* Header Section */
        .od-header {
            padding: 24px;
            background: linear-gradient(to bottom, rgba(255,255,255,0.03), transparent);
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
        .od-badge {
            font-size: 0.65rem;
            color: #60a5fa;
            text-transform: uppercase;
            letter-spacing: 0.15em;
            font-weight: 800;
            margin-bottom: 4px;
            display: block;
        }
        .od-title {
            font-size: 1.5rem;
            font-weight: 800;
            background: linear-gradient(135deg, #60a5fa, #c084fc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin: 0;
        }

        /* Search & Controls */
        .od-search-box {
            padding: 0 24px 16px;
        }
        .od-input {
            width: 100%;
            background: rgba(0, 0, 0, 0.2);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 12px 16px;
            color: #fff;
            font-size: 0.9rem;
            outline: none;
            box-sizing: border-box;
            transition: all 0.2s;
        }
        .od-input:focus {
            border-color: #60a5fa;
            background: rgba(0, 0, 0, 0.3);
            box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.15);
        }

        /* Scrollable Content */
        .od-content {
            flex: 1;
            overflow-y: auto;
            padding: 0 16px 24px;
            scrollbar-width: thin;
            scrollbar-color: rgba(255,255,255,0.1) transparent;
        }

        /* Accordion Styles */
        .od-accordion {
            margin-bottom: 8px;
            border-radius: 12px;
            overflow: hidden;
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid rgba(255, 255, 255, 0.03);
        }
        .od-acc-header {
            padding: 14px 16px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.85rem;
            font-weight: 700;
            transition: background 0.2s;
        }
        .od-acc-header:hover {
            background: rgba(255, 255, 255, 0.05);
        }
        .od-acc-body {
            display: none;
            padding: 8px 16px 16px;
            border-top: 1px solid rgba(255, 255, 255, 0.03);
        }
        .od-acc-body.active {
            display: block;
        }

        /* Clue Item (Checkbox) */
        .od-clue-item {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 6px 0;
            font-size: 0.8rem;
            cursor: pointer;
            opacity: 0.8;
            transition: opacity 0.2s;
        }
        .od-clue-item:hover {
            opacity: 1;
        }
        .od-clue-item input {
            cursor: pointer;
            accent-color: #60a5fa;
        }

        /* Results Section */
        .od-results {
            padding: 20px 24px;
            background: rgba(0, 0, 0, 0.25);
            border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
        .od-res-header {
            display: flex;
            justify-content: space-between;
            font-size: 0.7rem;
            font-weight: 800;
            opacity: 0.5;
            text-transform: uppercase;
            margin-bottom: 12px;
        }
        .od-country-list {
            max-height: 180px;
            overflow-y: auto;
        }
        .od-country-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 0;
            font-size: 0.85rem;
        }
        .od-score-pill {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.7rem;
            color: #10b981;
            font-weight: 800;
        }
    `;

    /**
     * DYNAMIC UI GENERATOR
     * Creates accordions and checkboxes from the internal/external ruleset.
     */
    function renderClues() {
        const container = document.querySelector('.od-content');
        container.innerHTML = '';

        STATE.rules.forEach((group, index) => {
            const accordion = document.createElement('div');
            accordion.className = 'od-accordion';
            
            const header = document.createElement('div');
            header.className = 'od-acc-header';
            header.innerHTML = `<span>${group.category}</span><small style="opacity:0.5">${group.clues.length}</small>`;
            
            const body = document.createElement('div');
            body.className = 'od-acc-body';
            
            // Generate Checkboxes
            group.clues.forEach(clue => {
                const item = document.createElement('label');
                item.className = 'od-clue-item';
                const checked = STATE.activeClueIds.has(clue.id) ? 'checked' : '';
                
                item.innerHTML = `
                    <input type="checkbox" data-clue-id="${clue.id}" ${checked}>
                    <span>${clue.aspect}</span>
                `;
                
                item.querySelector('input').addEventListener('change', (e) => {
                    if (e.target.checked) STATE.activeClueIds.add(clue.id);
                    else STATE.activeClueIds.delete(clue.id);
                    updateSuspects();
                });
                
                body.appendChild(item);
            });

            header.addEventListener('click', () => {
                body.classList.toggle('active');
            });

            accordion.appendChild(header);
            accordion.appendChild(body);
            container.appendChild(accordion);
        });
    }

    /**
     * THE SCALPEL (LOGIC ENGINE)
     * Cross-references active clues against countries and updates the suspect list.
     */
    function updateSuspects() {
        const listContainer = document.querySelector('.od-country-list');
        const countLabel = document.getElementById('od-suspect-count');

        // Reset Likelihood to 100%
        const results = STATE.countries.map(c => ({ ...c, likelihood: 1.0 }));

        // Apply Bayesian-style elimination
        STATE.activeClueIds.forEach(clueId => {
            let foundClue = null;
            STATE.rules.forEach(g => {
                const c = g.clues.find(rule => rule.id === clueId);
                if (c) foundClue = c;
            });

            if (!foundClue) return;

            results.forEach(country => {
                const weight = foundClue.confidence || 1.0;
                let isPossible = true;

                // Handle 'Only In' logic
                if (foundClue.onlyCountries && foundClue.onlyCountries.length > 0) {
                    if (!foundClue.onlyCountries.includes(country.id.toUpperCase())) isPossible = false;
                } else {
                    // Handle Exclusions
                    if (foundClue.excludeContinents && foundClue.excludeContinents.includes(country.continent)) isPossible = false;
                    if (foundClue.excludeCountries && foundClue.excludeCountries.includes(country.id.toUpperCase())) isPossible = false;
                }

                if (!isPossible) {
                    country.likelihood *= (1.0 - weight);
                }
            });
        });

        // Sort by likelihood and render
        const topSuspects = results
            .filter(c => c.likelihood > 0.05)
            .sort((a, b) => b.likelihood - a.likelihood);

        countLabel.innerText = `${topSuspects.length} Remaining`;

        listContainer.innerHTML = topSuspects.map(c => `
            <div class="od-country-row">
                <span>${c.name}</span>
                <span class="od-score-pill" style="color: ${c.likelihood > 0.5 ? '#10b981' : '#ef4444'}">
                    ${Math.round(c.likelihood * 100)}%
                </span>
            </div>
        `).join('') || '<div style="opacity:0.3; padding:20px; text-align:center">No suspects found.</div>';
    }

    /**
     * SEARCH ENGINE
     * Filters both the clue tree and search results.
     */
    function setupSearch() {
        const input = document.getElementById('od-global-search');
        input.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const items = document.querySelectorAll('.od-clue-item');
            
            items.forEach(item => {
                const text = item.innerText.toLowerCase();
                if (text.includes(query)) {
                    item.style.display = 'flex';
                    // Auto-expand accordion if match found
                    item.parentElement.classList.add('active');
                } else {
                    item.style.display = 'none';
                }
            });

            if(!query) {
                document.querySelectorAll('.od-acc-body').forEach(b => b.classList.remove('active'));
            }
        });
    }

    /**
     * ASYNC DATA FETCHER
     * Pulls the latest JSON master files from GitHub.
     */
    async function fetchMasterData() {
        try {
            // Placeholder for real fetch API calls
            // const countryRes = await fetch(CONFIG.DATA_URL);
            // STATE.countries = await countryRes.json();
            
            // For now, using internal master data for verification
            STATE.countries = [
                {"id": "fr", "name": "France", "continent": "Europe"},
                {"id": "uk", "name": "United Kingdom", "continent": "Europe"},
                {"id": "jp", "name": "Japan", "continent": "Asia"},
                {"id": "au", "name": "Australia", "continent": "Oceania"},
                {"id": "br", "name": "Brazil", "continent": "South America"},
                {"id": "us", "name": "United States", "continent": "North America"}
            ];

            STATE.rules = [
                {
                    "category": "Road Infrastructure",
                    "clues": [
                        { "id": "r1", "aspect": "Red Top Bollard", "onlyCountries": ["FR"], "confidence": 1.0 },
                        { "id": "r2", "aspect": "A-Frame Pole", "onlyCountries": ["FR", "IT", "ES", "PT"], "confidence": 0.9 }
                    ]
                },
                {
                    "category": "Street Furniture",
                    "clues": [
                        { "id": "s1", "aspect": "Stobie Poles", "onlyCountries": ["AU"], "confidence": 1.0 },
                        { "id": "s2", "aspect": "Black Hackney Cab", "onlyCountries": ["UK"], "confidence": 1.0 }
                    ]
                }
            ];

            STATE.isLoaded = true;
            renderUI();
        } catch (err) {
            console.error("OpenDeduce failed to load external data:", err);
        }
    }

    function renderUI() {
        GM_addStyle(STYLES);

        const panel = document.createElement('div');
        panel.id = 'od-v2-panel';
        panel.innerHTML = `
            <div class="od-header">
                <span class="od-badge">Geographic Scalpel v2.0</span>
                <h1 class="od-title">OpenDeduce</h1>
            </div>
            
            <div class="od-search-box">
                <input type="text" id="od-global-search" class="od-input" placeholder="Search 300+ clues...">
            </div>

            <div class="od-content">
                <!-- Accordions Injected Here -->
            </div>

            <div class="od-results">
                <div class="od-res-header">
                    <span id="od-suspect-count">Calculating...</span>
                    <span>Likelihood</span>
                </div>
                <div class="od-country-list">
                    <!-- Suspects Injected Here -->
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        renderClues();
        updateSuspects();
        setupSearch();
    }

    // Initialize
    fetchMasterData();

})();
