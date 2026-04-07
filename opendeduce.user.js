// ==UserScript==
// @name         OpenDeduce: The Geo-Elimination Engine
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  An interactive, on-screen Tampermonkey overlay for OpenGuessr that dynamically narrows down possible countries with probabilistic scoring and a full 195+ country master list.
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
            background: rgba(8, 8, 8, 0.9);
            backdrop-filter: blur(25px) saturate(180%);
            -webkit-backdrop-filter: blur(25px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 24px;
            color: #ffffff;
            font-family: 'Inter', system-ui, sans-serif;
            z-index: 9999;
            box-shadow: 0 12px 48px rgba(0, 0, 0, 0.7);
            padding: 24px;
            user-select: none;
            transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        .od-header {
            display: flex;
            flex-direction: column;
            gap: 4px;
            margin-bottom: 20px;
        }

        .od-title {
            font-size: 1.4rem;
            font-weight: 800;
            background: linear-gradient(135deg, #60a5fa, #a855f7, #ec4899);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            letter-spacing: -0.02em;
        }

        .od-subtitle {
            font-size: 0.65rem;
            color: #60a5fa;
            text-transform: uppercase;
            letter-spacing: 0.14em;
            font-weight: 700;
            opacity: 0.8;
        }

        .od-search-container {
            position: relative;
            margin-bottom: 24px;
        }

        .od-input {
            width: 100%;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            padding: 12px 14px;
            color: #fff;
            font-size: 0.85rem;
            outline: none;
            box-sizing: border-box;
            transition: all 0.2s;
        }

        .od-input:focus {
            background: rgba(255, 255, 255, 0.08);
            border-color: #60a5fa;
            box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.1);
        }

        .od-suggestions {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: #121212;
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 14px;
            margin-top: 8px;
            max-height: 240px;
            overflow-y: auto;
            z-index: 100;
            display: none;
            box-shadow: 0 10px 30px rgba(0,0,0,0.6);
        }

        .od-suggestion-item {
            padding: 12px 16px;
            font-size: 0.82rem;
            cursor: pointer;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            transition: background 0.2s;
        }

        .od-suggestion-item:hover {
            background: rgba(96, 165, 250, 0.15);
        }

        .od-active-clues {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-bottom: 20px;
        }

        .od-tag {
            background: rgba(96, 165, 250, 0.12);
            color: #60a5fa;
            font-size: 0.72rem;
            padding: 6px 12px;
            border: 1px solid rgba(96, 165, 250, 0.25);
            border-radius: 10px;
            cursor: pointer;
            display: flex;
            align-items: center;
            font-weight: 600;
            transition: all 0.2s;
        }

        .od-tag:hover {
            background: rgba(239, 68, 68, 0.15);
            color: #ef4444;
            border-color: rgba(239, 68, 68, 0.3);
        }

        .od-tag::after {
            content: ' ×';
            margin-left: 6px;
            font-size: 1rem;
            opacity: 0.6;
        }

        .od-suspect-list {
            background: rgba(0, 0, 0, 0.3);
            border-radius: 18px;
            padding: 14px;
            max-height: 280px;
            overflow-y: auto;
        }

        .od-country-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 10px 12px;
            border-radius: 12px;
            margin-bottom: 6px;
            transition: all 0.2s;
        }

        .od-country-row:hover {
            background: rgba(255, 255, 255, 0.06);
            transform: translateX(4px);
        }

        .od-likelihood-bar {
            height: 5px;
            background: rgba(255, 255, 255, 0.08);
            border-radius: 3px;
            width: 60px;
            margin-left: 14px;
            overflow: hidden;
            position: relative;
        }

        .od-likelihood-fill {
            height: 100%;
            background: #10b981;
            transition: width 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .od-score {
            font-family: 'JetBrains Mono', 'Fira Code', monospace;
            font-size: 0.75rem;
            color: #10b981;
            min-width: 45px;
            text-align: right;
            font-weight: 700;
        }

        .od-count-label {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 14px;
            font-size: 0.7rem;
            font-weight: 800;
            opacity: 0.5;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
    `;

    GM_addStyle(STYLES);

    // --- State ---
    let countries = [];
    let allClues = [];
    let activeClueIds = new Set();

    // --- Scoring Engine ---
    function updateHUD() {
        const listContainer = document.getElementById('od-suspect-list');
        const countBadge = document.getElementById('od-count-badge');
        const activeContainer = document.getElementById('od-active-clues');

        // Reset scores
        let results = countries.map(c => ({...c, currentScore: 1.0}));

        // Apply rules
        activeClueIds.forEach(id => {
            const clue = allClues.find(c => c.id === id);
            if (!clue) return;

            results.forEach(country => {
                const confidence = clue.confidence || 1.0;
                let isMatch = true;

                // Check ONLY rules
                if (clue.onlyCountries && clue.onlyCountries.length > 0) {
                    isMatch = clue.onlyCountries.includes(country.id.toUpperCase());
                } else {
                    // Check EXCLUDE rules
                    if (clue.excludeContinents && clue.excludeContinents.includes(country.continent)) isMatch = false;
                    if (clue.excludeCountries && clue.excludeCountries.includes(country.id.toUpperCase())) isMatch = false;
                    
                    if (clue.excludeRegions) {
                        if (clue.excludeRegions.includes("Mainland Europe") && country.continent === "Europe" && country.id !== "uk" && country.id !== "ie") isMatch = false;
                        if (clue.excludeRegions.includes("Asia") && country.continent === "Asia") isMatch = false;
                        if (clue.excludeRegions.includes("Sub-Saharan Africa") && ["ZA", "BW", "LS", "SZ", "KE", "UG", "GH", "NG", "SN"].includes(country.id.toUpperCase())) isMatch = false;
                    }
                }

                if (!isMatch) {
                    country.currentScore = Math.max(0, country.currentScore * (1.0 - confidence));
                }
            });
        });

        const sorted = results
            .filter(c => c.currentScore > 0.001)
            .sort((a, b) => b.currentScore - a.currentScore);

        countBadge.innerText = `${sorted.length} Suspects Remaining`;

        listContainer.innerHTML = sorted.map(c => {
            const pct = Math.round(c.currentScore * 100);
            const color = pct > 60 ? '#10b981' : (pct > 25 ? '#f59e0b' : '#ef4444');
            return `
                <div class="od-country-row">
                    <span style="${pct > 80 ? 'font-weight: 700; color: #fff;' : 'opacity: 0.8;'}">${c.name}</span>
                    <div style="display: flex; align-items: center;">
                        <span class="od-score" style="color: ${color}">${pct}%</span>
                        <div class="od-likelihood-bar">
                            <div class="od-likelihood-fill" style="width: ${pct}%; background: ${color}"></div>
                        </div>
                    </div>
                </div>
            `;
        }).join('') || '<div style="opacity:0.3; padding: 40px; text-align: center; font-size: 0.8rem;">No matches. Check your clues!</div>';

        // Update Tags
        activeContainer.innerHTML = Array.from(activeClueIds).map(id => {
            const clue = allClues.find(c => c.id === id);
            return `<div class="od-tag" data-id="${id}">${clue.aspect}</div>`;
        }).join('');

        document.querySelectorAll('.od-tag').forEach(tag => {
            tag.addEventListener('click', () => {
                activeClueIds.delete(tag.dataset.id);
                updateHUD();
            });
        });
    }

    function setupSearch() {
        const input = document.getElementById('od-search-input');
        const suggestBox = document.getElementById('od-suggestions');

        input.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            if (!val) { suggestBox.style.display = 'none'; return; }

            const matches = allClues.filter(c => 
                c.aspect.toLowerCase().includes(val) || 
                c.category.toLowerCase().includes(val)
            ).slice(0, 10);

            if (matches.length > 0) {
                suggestBox.innerHTML = matches.map(c => `
                    <div class="od-suggestion-item" data-id="${c.id}">
                        <div style="font-size: 0.6rem; color: #60a5fa; margin-bottom: 2px; text-transform: uppercase; font-weight: 800;">${c.category}</div>
                        <div>${c.aspect}</div>
                        <div style="font-size: 0.6rem; opacity: 0.5; margin-top: 2px;">Exclusion Weight: ${Math.round((c.confidence||1)*100)}%</div>
                    </div>
                `).join('');
                suggestBox.style.display = 'block';
            } else { suggestBox.style.display = 'none'; }
        });

        suggestBox.addEventListener('click', (e) => {
            const item = e.target.closest('.od-suggestion-item');
            if (item) {
                activeClueIds.add(item.dataset.id);
                input.value = '';
                suggestBox.style.display = 'none';
                updateHUD();
            }
        });

        document.addEventListener('click', (e) => { if (!input.contains(e.target)) suggestBox.style.display = 'none'; });
    }

    async function init() {
        countries = [
            {"id": "al", "name": "Albania", "continent": "Europe"},
            {"id": "ad", "name": "Andorra", "continent": "Europe"},
            {"id": "at", "name": "Austria", "continent": "Europe"},
            {"id": "by", "name": "Belarus", "continent": "Europe"},
            {"id": "be", "name": "Belgium", "continent": "Europe"},
            {"id": "ba", "name": "Bosnia and Herzegovina", "continent": "Europe"},
            {"id": "bg", "name": "Bulgaria", "continent": "Europe"},
            {"id": "hr", "name": "Croatia", "continent": "Europe"},
            {"id": "cz", "name": "Czechia", "continent": "Europe"},
            {"id": "dk", "name": "Denmark", "continent": "Europe"},
            {"id": "ee", "name": "Estonia", "continent": "Europe"},
            {"id": "fi", "name": "Finland", "continent": "Europe"},
            {"id": "fr", "name": "France", "continent": "Europe"},
            {"id": "de", "name": "Germany", "continent": "Europe"},
            {"id": "gr", "name": "Greece", "continent": "Europe"},
            {"id": "hu", "name": "Hungary", "continent": "Europe"},
            {"id": "is", "name": "Iceland", "continent": "Europe"},
            {"id": "ie", "name": "Ireland", "continent": "Europe"},
            {"id": "it", "name": "Italy", "continent": "Europe"},
            {"id": "ks", "name": "Kosovo", "continent": "Europe"},
            {"id": "lv", "name": "Latvia", "continent": "Europe"},
            {"id": "li", "name": "Liechtenstein", "continent": "Europe"},
            {"id": "lt", "name": "Lithuania", "continent": "Europe"},
            {"id": "lu", "name": "Luxembourg", "continent": "Europe"},
            {"id": "mt", "name": "Malta", "continent": "Europe"},
            {"id": "md", "name": "Moldova", "continent": "Europe"},
            {"id": "mc", "name": "Monaco", "continent": "Europe"},
            {"id": "me", "name": "Montenegro", "continent": "Europe"},
            {"id": "mk", "name": "North Macedonia", "continent": "Europe"},
            {"id": "pl", "name": "Poland", "continent": "Europe"},
            {"id": "nl", "name": "Netherlands", "continent": "Europe"},
            {"id": "pt", "name": "Portugal", "continent": "Europe"},
            {"id": "sk", "name": "Slovakia", "continent": "Europe"},
            {"id": "ro", "name": "Romania", "continent": "Europe"},
            {"id": "no", "name": "Norway", "continent": "Europe"},
            {"id": "sm", "name": "San Marino", "continent": "Europe"},
            {"id": "rs", "name": "Serbia", "continent": "Europe"},
            {"id": "si", "name": "Slovenia", "continent": "Europe"},
            {"id": "es", "name": "Spain", "continent": "Europe"},
            {"id": "se", "name": "Sweden", "continent": "Europe"},
            {"id": "ch", "name": "Switzerland", "continent": "Europe"},
            {"id": "uk", "name": "United Kingdom", "continent": "Europe"},
            {"id": "ua", "name": "Ukraine", "continent": "Europe"},
            {"id": "va", "name": "Vatican City", "continent": "Europe"},
            {"id": "af", "name": "Afghanistan", "continent": "Asia"},
            {"id": "am", "name": "Armenia", "continent": "Asia"},
            {"id": "az", "name": "Azerbaijan", "continent": "Asia"},
            {"id": "bd", "name": "Bangladesh", "continent": "Asia"},
            {"id": "bt", "name": "Bhutan", "continent": "Asia"},
            {"id": "bn", "name": "Brunei", "continent": "Asia"},
            {"id": "kh", "name": "Cambodia", "continent": "Asia"},
            {"id": "cn", "name": "China", "continent": "Asia"},
            {"id": "cy", "name": "Cyprus", "continent": "Asia"},
            {"id": "ge", "name": "Georgia", "continent": "Asia"},
            {"id": "in", "name": "India", "continent": "Asia"},
            {"id": "id", "name": "Indonesia", "continent": "Asia"},
            {"id": "ir", "name": "Iran", "continent": "Asia"},
            {"id": "iq", "name": "Iraq", "continent": "Asia"},
            {"id": "il", "name": "Israel", "continent": "Asia"},
            {"id": "jp", "name": "Japan", "continent": "Asia"},
            {"id": "jo", "name": "Jordan", "continent": "Asia"},
            {"id": "kz", "name": "Kazakhstan", "continent": "Asia"},
            {"id": "kw", "name": "Kuwait", "continent": "Asia"},
            {"id": "kg", "name": "Kyrgyzstan", "continent": "Asia"},
            {"id": "la", "name": "Laos", "continent": "Asia"},
            {"id": "lb", "name": "Lebanon", "continent": "Asia"},
            {"id": "my", "name": "Malaysia", "continent": "Asia"},
            {"id": "mv", "name": "Maldives", "continent": "Asia"},
            {"id": "mn", "name": "Mongolia", "continent": "Asia"},
            {"id": "mm", "name": "Myanmar", "continent": "Asia"},
            {"id": "np", "name": "Nepal", "continent": "Asia"},
            {"id": "om", "name": "Oman", "continent": "Asia"},
            {"id": "pk", "name": "Pakistan", "continent": "Asia"},
            {"id": "qa", "name": "Qatar", "continent": "Asia"},
            {"id": "ru", "name": "Russia", "continent": "Asia"},
            {"id": "sa", "name": "Saudi Arabia", "continent": "Asia"},
            {"id": "kr", "name": "South Korea", "continent": "Asia"},
            {"id": "lk", "name": "Sri Lanka", "continent": "Asia"},
            {"id": "sy", "name": "Syria", "continent": "Asia"},
            {"id": "ps", "name": "Palestine", "continent": "Asia"},
            {"id": "kp", "name": "North Korea", "continent": "Asia"},
            {"id": "ph", "name": "Philippines", "continent": "Asia"},
            {"id": "sg", "name": "Singapore", "continent": "Asia"},
            {"id": "tw", "name": "Taiwan", "continent": "Asia"},
            {"id": "tj", "name": "Tajikistan", "continent": "Asia"},
            {"id": "th", "name": "Thailand", "continent": "Asia"},
            {"id": "tl", "name": "East Timor", "continent": "Asia"},
            {"id": "tr", "name": "Turkey", "continent": "Asia"},
            {"id": "tm", "name": "Turkmenistan", "continent": "Asia"},
            {"id": "ae", "name": "United Arab Emirates", "continent": "Asia"},
            {"id": "uz", "name": "Uzbekistan", "continent": "Asia"},
            {"id": "vn", "name": "Vietnam", "continent": "Asia"},
            {"id": "ye", "name": "Yemen", "continent": "Asia"},
            {"id": "dz", "name": "Algeria", "continent": "Africa"},
            {"id": "ao", "name": "Angola", "continent": "Africa"},
            {"id": "bj", "name": "Benin", "continent": "Africa"},
            {"id": "bw", "name": "Botswana", "continent": "Africa"},
            {"id": "bf", "name": "Burkina Faso", "continent": "Africa"},
            {"id": "bi", "name": "Burundi", "continent": "Africa"},
            {"id": "cm", "name": "Cameroon", "continent": "Africa"},
            {"id": "cv", "name": "Cape Verde", "continent": "Africa"},
            {"id": "cf", "name": "Central African Republic", "continent": "Africa"},
            {"id": "td", "name": "Chad", "continent": "Africa"},
            {"id": "cg", "name": "Congo", "continent": "Africa"},
            {"id": "km", "name": "Comoros", "continent": "Africa"},
            {"id": "cd", "name": "Democratic Republic of the Congo", "continent": "Africa"},
            {"id": "dj", "name": "Djibouti", "continent": "Africa"},
            {"id": "eg", "name": "Egypt", "continent": "Africa"},
            {"id": "gq", "name": "Equatorial Guinea", "continent": "Africa"},
            {"id": "er", "name": "Eritrea", "continent": "Africa"},
            {"id": "sz", "name": "Eswatini", "continent": "Africa"},
            {"id": "et", "name": "Ethiopia", "continent": "Africa"},
            {"id": "ga", "name": "Gabon", "continent": "Africa"},
            {"id": "gm", "name": "Gambia", "continent": "Africa"},
            {"id": "gh", "name": "Ghana", "continent": "Africa"},
            {"id": "gn", "name": "Guinea", "continent": "Africa"},
            {"id": "gw", "name": "Guinea Bissau", "continent": "Africa"},
            {"id": "ci", "name": "Ivory Coast", "continent": "Africa"},
            {"id": "ke", "name": "Kenya", "continent": "Africa"},
            {"id": "ls", "name": "Lesotho", "continent": "Africa"},
            {"id": "lr", "name": "Liberia", "continent": "Africa"},
            {"id": "ly", "name": "Libya", "continent": "Africa"},
            {"id": "mg", "name": "Madagascar", "continent": "Africa"},
            {"id": "mu", "name": "Mauritius", "continent": "Africa"},
            {"id": "mw", "name": "Malawi", "continent": "Africa"},
            {"id": "ml", "name": "Mali", "continent": "Africa"},
            {"id": "mr", "name": "Mauritania", "continent": "Africa"},
            {"id": "ma", "name": "Morocco", "continent": "Africa"},
            {"id": "mz", "name": "Mozambique", "continent": "Africa"},
            {"id": "na", "name": "Namibia", "continent": "Africa"},
            {"id": "ne", "name": "Niger", "continent": "Africa"},
            {"id": "ng", "name": "Nigeria", "continent": "Africa"},
            {"id": "rw", "name": "Rwanda", "continent": "Africa"},
            {"id": "st", "name": "Sao Tome and Principe", "continent": "Africa"},
            {"id": "sn", "name": "Senegal", "continent": "Africa"},
            {"id": "sl", "name": "Sierra Leone", "continent": "Africa"},
            {"id": "so", "name": "Somalia", "continent": "Africa"},
            {"id": "za", "name": "South Africa", "continent": "Africa"},
            {"id": "sd", "name": "Sudan", "continent": "Africa"},
            {"id": "ss", "name": "South Sudan", "continent": "Africa"},
            {"id": "sc", "name": "Seychelles", "continent": "Africa"},
            {"id": "tz", "name": "Tanzania", "continent": "Africa"},
            {"id": "tg", "name": "Togo", "continent": "Africa"},
            {"id": "eh", "name": "Western Sahara", "continent": "Africa"},
            {"id": "tn", "name": "Tunisia", "continent": "Africa"},
            {"id": "ug", "name": "Uganda", "continent": "Africa"},
            {"id": "zm", "name": "Zambia", "continent": "Africa"},
            {"id": "zw", "name": "Zimbabwe", "continent": "Africa"},
            {"id": "bs", "name": "Bahamas", "continent": "North America"},
            {"id": "bz", "name": "Belize", "continent": "North America"},
            {"id": "ca", "name": "Canada", "continent": "North America"},
            {"id": "cr", "name": "Costa Rica", "continent": "North America"},
            {"id": "cu", "name": "Cuba", "continent": "North America"},
            {"id": "ht", "name": "Haiti", "continent": "North America"},
            {"id": "do", "name": "Dominican Republic", "continent": "North America"},
            {"id": "sv", "name": "El Salvador", "continent": "North America"},
            {"id": "gt", "name": "Guatemala", "continent": "North America"},
            {"id": "hn", "name": "Honduras", "continent": "North America"},
            {"id": "jm", "name": "Jamaica", "continent": "North America"},
            {"id": "mx", "name": "Mexico", "continent": "North America"},
            {"id": "ni", "name": "Nicaragua", "continent": "North America"},
            {"id": "pa", "name": "Panama", "continent": "North America"},
            {"id": "us", "name": "United States", "continent": "North America"},
            {"id": "ar", "name": "Argentina", "continent": "South America"},
            {"id": "bo", "name": "Bolivia", "continent": "South America"},
            {"id": "br", "name": "Brazil", "continent": "South America"},
            {"id": "cl", "name": "Chile", "continent": "South America"},
            {"id": "co", "name": "Colombia", "continent": "South America"},
            {"id": "ec", "name": "Ecuador", "continent": "South America"},
            {"id": "gy", "name": "Guyana", "continent": "South America"},
            {"id": "py", "name": "Paraguay", "continent": "South America"},
            {"id": "pe", "name": "Peru", "continent": "South America"},
            {"id": "sr", "name": "Suriname", "continent": "South America"},
            {"id": "uy", "name": "Uruguay", "continent": "South America"},
            {"id": "ve", "name": "Venezuela", "continent": "South America"},
            {"id": "au", "name": "Australia", "continent": "Oceania"},
            {"id": "nr", "name": "Nauru", "continent": "Oceania"},
            {"id": "fj", "name": "Fiji", "continent": "Oceania"},
            {"id": "mh", "name": "Marshall Islands", "continent": "Oceania"},
            {"id": "fm", "name": "Micronesia", "continent": "Oceania"},
            {"id": "nc", "name": "New Caledonia", "continent": "Oceania"},
            {"id": "nz", "name": "New Zealand", "continent": "Oceania"},
            {"id": "pw", "name": "Palau", "continent": "Oceania"},
            {"id": "pg", "name": "Papua New Guinea", "continent": "Oceania"},
            {"id": "sb", "name": "Solomon Islands", "continent": "Oceania"},
            {"id": "tv", "name": "Tuvalu", "continent": "Oceania"},
            {"id": "vu", "name": "Vanuatu", "continent": "Oceania"}
        ];

        allClues = [
            { "id": "1", "aspect": "Driving Side: Left", "category": "Global", "excludeContinents": ["North America", "South America"], "excludeRegions": ["Mainland Europe"], "confidence": 1.0 },
            { "id": "2", "aspect": "Driving Side: Right", "category": "Global", "excludeContinents": ["Oceania"], "excludeCountries": ["UK", "IE", "ZA", "JP", "IN", "TH", "MY", "ID", "SG"], "confidence": 1.0 },
            { "id": "p2-1", "aspect": "Pharmacy: Green LED Cross", "category": "Retail", "excludeContinents": ["North America", "Oceania", "Africa"], "excludeRegions": ["Asia"], "confidence": 0.95 },
            { "id": "p2-4", "aspect": "Tabac Red Diamond", "category": "Retail", "onlyCountries": ["FR"], "confidence": 1.0 },
            { "id": "p2-17", "aspect": "Indomaret / Alfamart", "category": "Retail", "onlyCountries": ["ID"], "confidence": 1.0 },
            { "id": "p2-18", "aspect": "Tim Hortons Coverage", "category": "Retail", "onlyCountries": ["CA", "US"], "confidence": 0.95 },
            { "id": "p2-35", "aspect": "Bus: Red Double Decker", "category": "Transit", "onlyCountries": ["UK"], "confidence": 0.95 },
            { "id": "p2-40", "aspect": "Jeepneys (Philippines)", "category": "Transit", "onlyCountries": ["PH"], "confidence": 1.0 },
            { "id": "p2-13", "aspect": "Extreme Vending Density", "category": "Retail", "onlyCountries": ["JP"], "confidence": 0.95 },
            { "id": "p2-235", "aspect": "Pichação Graffiti", "category": "Street Art", "onlyCountries": ["BR"], "confidence": 1.0 },
            { "id": "p2-285", "aspect": "Stobie Poles", "category": "Infra", "onlyCountries": ["AU"], "confidence": 1.0 },
            { "id": "p2-139", "aspect": "Cenotes (Sinkholes)", "category": "Topo", "onlyCountries": ["MX"], "confidence": 1.0 }
        ];

        const hud = document.createElement('div');
        hud.id = 'opendeduce-hud';
        hud.innerHTML = `
            <div class="od-header">
                <span class="od-subtitle">Exclusion Engine • v2.1</span>
                <span class="od-title">OpenDeduce</span>
            </div>
            
            <div class="od-search-container">
                <input type="text" id="od-search-input" class="od-input" placeholder="Search clues (e.g. 'Jeepney')...">
                <div id="od-suggestions" class="od-suggestions"></div>
            </div>

            <div id="od-active-clues" class="od-active-clues"></div>

            <div class="od-count-label">
                <span id="od-count-badge">Calculating suspects...</span>
                <span>Likelihood</span>
            </div>

            <div class="od-suspect-list" id="od-suspect-list"></div>
        `;

        document.body.appendChild(hud);
        setupSearch();
        updateHUD();
    }

    init();
})();
