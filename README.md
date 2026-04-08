**Before we start:** Hey guys, here is the developer. If you play Openguesser and you love it, but you are trash at it, or you definitely want to be better because of your friends' trash-talking XD, check this out! Instead of a cheat that does nothing, instead of getting you boring happiness, this Tampermonkey script STONGLY ENHANCES YOUR ABILITY through note-taking, where you note yourself the notable objects and stuff, and the advisor will help you filter countries, etc. PLEASE check it out!

# 🌍 OpenDeduce: The Geo-Elimination Engine

> An interactive, on-screen Tampermonkey overlay for OpenGuessr that dynamically narrows down possible countries using a live metadata checklist (driving side, sun position, bollard types, and alphabets).

## ⚠️ Disclaimer
**OpenDeduce is built strictly for educational purposes and training.** This tool is designed to help players learn geography, infrastructure, and deductive logic. It does not interact with hidden APIs or "cheat" by reading exact coordinates. 

*Note: The metadata logic (e.g., matching a specific bollard to a specific country) is based on community research and may occasionally contain errors, outdated information, or exceptions. Always use your best judgment!*

---

## ✨ Features

* **📉 The Dynamic "Suspect List"**
  Starts with all possible countries and aggressively filters them down as you check off clues. (e.g., Selecting "Left-Hand Drive" instantly eliminates ~65% of the globe).
* **🎛️ Visual Meta-Tag Dropdowns**
  Quick-reference toggles for the most common Street View meta: Camera Generations, License Plate styles, and unique infrastructure (like the Kenya Snorkel or Swiss Low-Cam).
* **🚨 Contradiction Catcher**
  Prevents you from going down the wrong rabbit hole. If you select "Left-Hand Drive" and "Cyrillic Alphabet," the HUD will flag a data conflict.
* **📋 After-Action Report (Exportable Logic)**
  At the end of a round, click to copy your exact deduction path to your clipboard (e.g., `Left Drive + Yellow Rear Plate + Striped Bollard = UK`) and share it in the issues of GitHub for the author to further improve the script and accuracy.

---

## 🚀 Installation

1. Install the [Tampermonkey](https://www.tampermonkey.net/) extension for your browser (Chrome, Firefox, Edge, Safari).
2. Click here to install the script: [Install OpenDeduce](https://raw.githack.com/AwesomeOddEven-NightKeys-LunarBlink/OpenDeduce_OpenGuessr-Advisor/main/opendeduce.user.js)
3. Alternatively, create a new script in Tampermonkey and paste the contents of `opendeduce.user.js`.
4. Open [OpenGuessr](https://openguessr.com/) and the overlay will automatically appear on the right side of your screen.

---

## 🛠️ How It Works (The Logic Engine)

Currently, OpenDeduce uses a hardcoded Process of Elimination matrix. The UI reads your checkbox inputs and filters a master list of countries based on standard metadata rules. 

**Upcoming Feature (Help Wanted!):**
We are transitioning the logic into an external `meta-database.json` file. This will allow the community to easily submit Pull Requests to update specific country clues without having to rewrite the core JavaScript UI.

---

## 🤝 Contributing

Found a meta rule that changed? Noticed a missing bollard type? Contributions make this tool better for everyone.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingMetaUpdate`)
3. Commit your Changes (`git commit -m 'Add new Ghana tape meta'`)
4. Push to the Branch (`git push origin feature/AmazingMetaUpdate`)
5. Open a Pull Request

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information. This means you are free to use, modify, and distribute this code as long as you provide attribution.
