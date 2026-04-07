// ==UserScript==
// @name         OpenDeduce: The Geo-Elimination Engine
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  An interactive, on-screen Tampermonkey overlay for OpenGuessr that dynamically narrows down possible countries.
// @author       OpenDeduce Team
// @match        https://openguessr.com/*
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @resource     COUNTRY_DATA https://raw.githubusercontent.com/AwesomeOddEven-NightKeys-LunarBlink/OpenDeduce---Openguessr-Advisor/main/meta-database.json
// ==/UserScript==

(function() {
    'use strict';

    // --- Design Tokens ---
    const STYLES = `
        #opendeduce-hud {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 320px;
            background: rgba(10, 10, 10, 0.85);
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.15);
            border-radius: 20px;
            color: #ffffff;
            font-family: 'Inter', system-ui, sans-serif;
            z-index: 9999;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
            padding: 20px;
            user-select: none;
            transition: transform 0.3s ease;
        }

        .od-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 20px;
        }

        .od-title {
            font-size: 1.2rem;
            font-weight: 800;
            background: linear-gradient(135deg, #3b82f6, #a855f7);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            letter-spacing: -0.01em;
        }

        .od-search-container {
            position: relative;
            margin-bottom: 20px;
        }

        .od-input {
            width: 100%;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            padding: 10px 12px;
            color: #fff;
            font-size: 0.85rem;
            outline: none;
            box-sizing: border-box;
            transition: border-color 0.2s;
        }

        .od-input:focus {
            border-color: #3b82f6;
        }

        .od-suggestions {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: #1a1a1a;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 10px;
            margin-top: 5px;
            max-height: 200px;
            overflow-y: auto;
            z-index: 100;
            display: none;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        }

        .od-suggestion-item {
            padding: 8px 12px;
            font-size: 0.8rem;
            cursor: pointer;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .od-suggestion-item:hover {
            background: rgba(59, 130, 246, 0.2);
        }

        .od-active-clues {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: 15px;
        }

        .od-tag {
            background: rgba(59, 130, 246, 0.15);
            color: #60a5fa;
            font-size: 0.7rem;
            padding: 4px 8px;
            border: 1px solid rgba(59, 130, 246, 0.3);
            border-radius: 6px;
            cursor: pointer;
            display: flex;
            align-items: center;
        }

        .od-tag::after {
            content: ' ×';
            margin-left: 6px;
            font-size: 0.9rem;
        }

        .od-suspect-list {
            background: rgba(0, 0, 0, 0.2);
            border-radius: 12px;
            padding: 10px;
            max-height: 250px;
            overflow-y: auto;
        }

        .od-country-row {
            display: flex;
            align-items: center;
            padding: 6px 0;
            font-size: 0.85rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .od-country-row:last-child {
            border: none;
        }

        .od-badge {
            background: #10b981;
            padding: 2px 8px;
            border-radius: 6px;
            font-size: 0.65rem;
            font-weight: 700;
        }
    `;

    GM_addStyle(STYLES);

    // --- Data ---
    let countries = [];
    let allClues = [];
    let activeClueIds = new Set();

    // --- Core Logic ---
    function updateHUD() {
        const listContainer = document.getElementById('od-suspect-list');
        const countBadge = document.getElementById('od-count-badge');
        const activeContainer = document.getElementById('od-active-clues');

        // Apply rules
        let filtered = [...countries];
        activeClueIds.forEach(id => {
            const clue = allClues.find(c => c.id === id);
            if (!clue) return;

            filtered = filtered.filter(country => {
                // If onlyCountries is defined, strictly include only those
                if (clue.onlyCountries && clue.onlyCountries.length > 0) {
                    return clue.onlyCountries.includes(country.id.toUpperCase());
                }

                // Apply exclusions
                if (clue.excludeContinents && clue.excludeContinents.includes(country.continent)) return false;
                if (clue.excludeCountries && clue.excludeCountries.includes(country.id.toUpperCase())) return false;
                
                // Regional logic (Simplified for Europe)
                if (clue.excludeRegions && clue.excludeRegions.includes("Mainland Europe")) {
                    if (country.continent === "Europe" && country.id !== "uk" && country.id !== "ie") return false;
                }
                if (clue.excludeRegions && clue.excludeRegions.includes("Western Europe")) {
                     const western = ["FR", "BE", "NL", "DE", "AT", "CH"];
                     if (western.includes(country.id.toUpperCase())) return false;
                }

                return true;
            });
        });

        // Update Counter
        countBadge.innerText = `${filtered.length} Suspects`;

        // Update Countries
        listContainer.innerHTML = filtered.map(c => `
            <div class="od-country-row">
                <span class="od-country-name">${c.name}</span>
            </div>
        `).join('') || '<div style="opacity:0.5; font-size: 0.8rem; text-align: center; padding: 20px;">No suspects remain. Are you sure?</div>';

        // Update Tags
        activeContainer.innerHTML = Array.from(activeClueIds).map(id => {
            const clue = allClues.find(c => c.id === id);
            return `<div class="od-tag" data-id="${id}">${clue.aspect}</div>`;
        }).join('');

        // Remove tag listener
        document.querySelectorAll('.od-tag').forEach(tag => {
            tag.addEventListener('click', () => {
                activeClueIds.delete(parseInt(tag.dataset.id));
                updateHUD();
            });
        });
    }

    function setupSearch() {
        const input = document.getElementById('od-search-input');
        const suggestBox = document.getElementById('od-suggestions');

        if (!input) return;

        input.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            if (!val) {
                suggestBox.style.display = 'none';
                return;
            }

            const matches = allClues.filter(c => 
                c.aspect.toLowerCase().includes(val) || 
                c.category.toLowerCase().includes(val)
            ).slice(0, 10);

            if (matches.length > 0) {
                suggestBox.innerHTML = matches.map(c => `
                    <div class="od-suggestion-item" data-id="${c.id}">
                        <div style="font-size: 0.65rem; color: #60a5fa; opacity: 0.7;">${c.category}</div>
                        <div>${c.aspect}</div>
                    </div>
                `).join('');
                suggestBox.style.display = 'block';
            } else {
                suggestBox.style.display = 'none';
            }
        });

        // Selection
        suggestBox.addEventListener('click', (e) => {
            const item = e.target.closest('.od-suggestion-item');
            if (item) {
                activeClueIds.add(parseInt(item.dataset.id));
                input.value = '';
                suggestBox.style.display = 'none';
                updateHUD();
            }
        });

        document.addEventListener('click', (e) => {
            if (!input.contains(e.target)) suggestBox.style.display = 'none';
        });
    }

    async function init() {
        countries = [
            {"id": "al", "name": "Albania", "continent": "Europe"},
            {"id": "ar", "name": "Argentina", "continent": "South America"},
            {"id": "au", "name": "Australia", "continent": "Oceania"},
            {"id": "bd", "name": "Bangladesh", "continent": "Asia"},
            {"id": "br", "name": "Brazil", "continent": "South America"},
            {"id": "ca", "name": "Canada", "continent": "North America"},
            {"id": "cl", "name": "Chile", "continent": "South America"},
            {"id": "co", "name": "Colombia", "continent": "South America"},
            {"id": "fr", "name": "France", "continent": "Europe"},
            {"id": "de", "name": "Germany", "continent": "Europe"},
            {"id": "gh", "name": "Ghana", "continent": "Africa"},
            {"id": "id", "name": "Indonesia", "continent": "Asia"},
            {"id": "ie", "name": "Ireland", "continent": "Europe"},
            {"id": "il", "name": "Israel", "continent": "Asia"},
            {"id": "it", "name": "Italy", "continent": "Europe"},
            {"id": "jp", "name": "Japan", "continent": "Asia"},
            {"id": "ke", "name": "Kenya", "continent": "Africa"},
            {"id": "kr", "name": "South Korea", "continent": "Asia"},
            {"id": "lt", "name": "Lithuania", "continent": "Europe"},
            {"id": "mx", "name": "Mexico", "continent": "North America"},
            {"id": "nz", "name": "New Zealand", "continent": "Oceania"},
            {"id": "no", "name": "Norway", "continent": "Europe"},
            {"id": "pl", "name": "Poland", "continent": "Europe"},
            {"id": "pt", "name": "Portugal", "continent": "Europe"},
            {"id": "ru", "name": "Russia", "continent": "Europe"},
            {"id": "za", "name": "South Africa", "continent": "Africa"},
            {"id": "se", "name": "Sweden", "continent": "Europe"},
            {"id": "th", "name": "Thailand", "continent": "Asia"},
            {"id": "tr", "name": "Turkey", "continent": "Europe"},
            {"id": "uk", "name": "United Kingdom", "continent": "Europe"},
            {"id": "us", "name": "United States", "continent": "North America"}
        ];

        allClues = [
            { "id": 1, "aspect": "Driving Side: Left", "category": "Global", "excludeContinents": ["North America", "South America"], "excludeRegions": ["Mainland Europe"], "excludeCountries": ["RU", "CN"] },
            { "id": 2, "aspect": "Driving Side: Right", "category": "Global", "excludeContinents": ["Oceania"], "excludeCountries": ["UK", "IE", "ZA", "JP", "IN", "TH", "MY", "ID", "SG"] },
            { "id": 3, "aspect": "Sun Position: North", "category": "Global", "excludeContinents": ["North America"], "excludeRegions": ["Europe"], "excludeCountries": ["RU", "JP", "CN"] },
            { "id": 11, "aspect": "Double Yellow Center", "category": "Road", "excludeContinents": ["Europe", "Africa", "Oceania"] },
            { "id": 125, "aspect": "A-Frame/Ladder Pole", "category": "Infra", "onlyCountries": ["FR", "ES", "PT", "IT", "RO"] },
            { "id": 145, "aspect": "Bollard: Red Top Band", "category": "Bollard", "onlyCountries": ["FR"] },
            { "id": 261, "aspect": "Cyrillic Alphabet", "category": "Lang", "excludeContinents": ["North America", "South America", "Oceania"], "excludeRegions": ["Western Europe"] },
            { "id": 264, "aspect": "Hebrew Alphabet", "category": "Lang", "onlyCountries": ["IL"] },
            { "id": 265, "aspect": "Hangul (Korean)", "category": "Lang", "onlyCountries": ["KR"] },
            { "id": 266, "aspect": "Kanji/Kana (Japanese)", "category": "Lang", "onlyCountries": ["JP"] },
            { "id": 278, "aspect": "Polish Modifiers (Ł, Ś)", "category": "Lang", "onlyCountries": ["PL"] }
        ];

        const hud = document.createElement('div');
        hud.id = 'opendeduce-hud';
        hud.innerHTML = `
            <div class="od-header">
                <span class="od-title">OpenDeduce</span>
                <span id="od-count-badge" class="od-badge">0 Suspects</span>
            </div>
            
            <div class="od-search-container">
                <input type="text" id="od-search-input" class="od-input" placeholder="Search clues (e.g. 'A-Frame')...">
                <div id="od-suggestions" class="od-suggestions"></div>
            </div>

            <div id="od-active-clues" class="od-active-clues"></div>

            <div class="od-suspect-list" id="od-suspect-list">
                <!-- Countries injected here -->
            </div>
        `;

        document.body.appendChild(hud);
        setupSearch();
        updateHUD();
    }

    init();
})();
