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
            width: 300px;
            background: rgba(15, 15, 15, 0.75);
            backdrop-filter: blur(12px) saturate(180%);
            -webkit-backdrop-filter: blur(12px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            color: #ffffff;
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            z-index: 9999;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
            padding: 16px;
            user-select: none;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .od-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 20px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            padding-bottom: 12px;
        }

        .od-title {
            font-size: 1.1rem;
            font-weight: 700;
            background: linear-gradient(135deg, #60a5fa, #c084fc);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            letter-spacing: -0.02em;
        }

        .od-section {
            margin-bottom: 16px;
        }

        .od-label {
            font-size: 0.75rem;
            text-transform: uppercase;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.5);
            margin-bottom: 8px;
            display: block;
        }

        .od-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
        }

        .od-button {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            padding: 8px 12px;
            color: #fff;
            font-size: 0.85rem;
            cursor: pointer;
            transition: all 0.2s ease;
            text-align: center;
        }

        .od-button:hover {
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 0.2);
        }

        .od-button.active {
            background: linear-gradient(135deg, rgba(96, 165, 250, 0.2), rgba(192, 132, 252, 0.2));
            border-color: #60a5fa;
            color: #60a5fa;
            box-shadow: 0 0 12px rgba(96, 165, 250, 0.3);
        }

        .od-suspect-list {
            margin-top: 20px;
            max-height: 150px;
            overflow-y: auto;
            scrollbar-width: thin;
        }

        .od-suspect-list::-webkit-scrollbar {
            width: 4px;
        }

        .od-suspect-list::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.2);
            border-radius: 10px;
        }

        .od-country-item {
            padding: 6px 0;
            font-size: 0.9rem;
            display: flex;
            align-items: center;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .od-country-flag {
            margin-right: 10px;
            width: 20px;
            height: 15px;
            object-fit: cover;
            border-radius: 2px;
        }

        .od-badge {
            background: #10b981;
            color: white;
            font-size: 0.65rem;
            padding: 2px 6px;
            border-radius: 4px;
            margin-left: auto;
        }
    `;

    GM_addStyle(STYLES);

    // --- State Management ---
    let countries = [];
    const activeFilters = {
        drivingSide: null,
        sunPosition: null,
        continent: null
    };

    // --- UI Implementation ---
    function createHUD() {
        const hud = document.createElement('div');
        hud.id = 'opendeduce-hud';
        hud.innerHTML = `
            <div class="od-header">
                <span class="od-title">OpenDeduce</span>
                <span id="od-count-badge" class="od-badge">Loading...</span>
            </div>
            
            <div class="od-section">
                <span class="od-label">Driving Side</span>
                <div class="od-grid">
                    <div class="od-button" data-filter="drivingSide" data-value="left">LHT (Left)</div>
                    <div class="od-button" data-filter="drivingSide" data-value="right">RHT (Right)</div>
                </div>
            </div>

            <div class="od-section">
                <span class="od-label">Sun Position</span>
                <div class="od-grid">
                    <div class="od-button" data-filter="sunPosition" data-value="north">North (South Hem)</div>
                    <div class="od-button" data-filter="sunPosition" data-value="south">South (North Hem)</div>
                </div>
            </div>

            <div class="od-section">
                <span class="od-label">Suspect List</span>
                <div id="od-suspect-list" class="od-suspect-list">
                    <!-- Countries will be injected here -->
                </div>
            </div>
        `;

        document.body.appendChild(hud);
        setupEventListeners();
    }

    function setupEventListeners() {
        document.querySelectorAll('.od-button').forEach(btn => {
            btn.addEventListener('click', () => {
                const filter = btn.dataset.filter;
                const value = btn.dataset.value;

                if (activeFilters[filter] === value) {
                    activeFilters[filter] = null;
                    btn.classList.remove('active');
                } else {
                    // Toggle off others in same section
                    document.querySelectorAll(`.od-button[data-filter="${filter}"]`).forEach(b => b.classList.remove('active'));
                    activeFilters[filter] = value;
                    btn.classList.add('active');
                }
                updateList();
            });
        });
    }

    function updateList() {
        const filtered = countries.filter(country => {
            if (activeFilters.drivingSide && country.drivingSide !== activeFilters.drivingSide) return false;
            if (activeFilters.sunPosition) {
                 if (country.sunPosition === 'north-or-south') {
                     // Flexible countries like Kenya/Ghana match both
                 } else if (country.sunPosition !== activeFilters.sunPosition) {
                     return false;
                 }
            }
            return true;
        });

        const listContainer = document.getElementById('od-suspect-list');
        const countBadge = document.getElementById('od-count-badge');
        
        listContainer.innerHTML = filtered.map(c => `
            <div class="od-country-item">
                <span>${c.name}</span>
            </div>
        `).join('');

        countBadge.innerText = `${filtered.length} Countries`;
    }

    // Initialize
    async function init() {
        try {
            // In a real environment, we would fetch the JSON.
            // For this demonstration and development, we'll hardcode a few or 
            // try to load the local file if possible (though GM_getResourceText is better).
            
            // Temporary hardcoded list for immediate feedback
            countries = [
                {"name": "Albania", "drivingSide": "right", "sunPosition": "south"},
                {"name": "Argentina", "drivingSide": "right", "sunPosition": "north"},
                {"name": "Australia", "drivingSide": "left", "sunPosition": "north"},
                {"name": "Bangladesh", "drivingSide": "left", "sunPosition": "south"},
                {"name": "Brazil", "drivingSide": "right", "sunPosition": "north"},
                {"name": "Canada", "drivingSide": "right", "sunPosition": "south"},
                {"name": "France", "drivingSide": "right", "sunPosition": "south"},
                {"name": "Ghana", "drivingSide": "right", "sunPosition": "north-or-south"},
                {"name": "Indonesia", "drivingSide": "left", "sunPosition": "north-or-south"},
                {"name": "Ireland", "drivingSide": "left", "sunPosition": "south"},
                {"name": "Italy", "drivingSide": "right", "sunPosition": "south"},
                {"name": "Japan", "drivingSide": "left", "sunPosition": "south"},
                {"name": "Kenya", "drivingSide": "left", "sunPosition": "north-or-south"},
                {"name": "Lithuania", "drivingSide": "right", "sunPosition": "south"},
                {"name": "Mexico", "drivingSide": "right", "sunPosition": "south"},
                {"name": "Nigeria", "drivingSide": "right", "sunPosition": "north-or-south"},
                {"name": "Norway", "drivingSide": "right", "sunPosition": "south"},
                {"name": "New Zealand", "drivingSide": "left", "sunPosition": "north"},
                {"name": "Poland", "drivingSide": "right", "sunPosition": "south"},
                {"name": "Portugal", "drivingSide": "right", "sunPosition": "south"},
                {"name": "Russia", "drivingSide": "right", "sunPosition": "south"},
                {"name": "South Africa", "drivingSide": "left", "sunPosition": "north"},
                {"name": "Thailand", "drivingSide": "left", "sunPosition": "south"},
                {"name": "United Kingdom", "drivingSide": "left", "sunPosition": "south"},
                {"name": "United States", "drivingSide": "right", "sunPosition": "south"}
            ];

            createHUD();
            updateList();
        } catch (e) {
            console.error("OpenDeduce failed to load:", e);
        }
    }

    init();
})();
