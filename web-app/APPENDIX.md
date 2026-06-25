# Ramstein Flag

A browser-based two-player strategy game inspired by the classic Chinese board game Luzhanqi (陆战棋), reimagined in an air combat setting. Built as a coursework submission for the Computing 2 module at the Dyson School of Design Engineering, Imperial College London.

---

## How to Run

1. Clone or download the repository
2. Navigate to the `web-app/` directory and start a local server:

```bash
npx serve .
```

3. Open `http://localhost:3000` in a browser
4. Two players share the same screen

---

## How to Play

Two commanders compete to capture the enemy **Command** aircraft. Each player controls five aircraft types with unique movement rules:

| Aircraft | Abbreviation | Movement |
|----------|-------------|----------|
| Fighter | F | L-shaped jump (like a chess knight); can also destroy adjacent enemies via Lock-on |
| Bomber | B | Up to 2 squares orthogonally; must rest one turn after moving |
| Recon | R | Up to 2 squares diagonally |
| Tanker | T | Up to 2 squares in any direction; can carry one friendly aircraft |
| Command | C | 1 square in any direction; losing it ends the game |

---

## Game Modes

**Classic** — Standard rules. Capture the enemy Command aircraft to win.

**Real Battle** — Restricted airspace is active. Each player's AA gun zones automatically destroy any enemy aircraft that enters, except Fighters. Capturing both Commanders simultaneously results in a draw.

---

## Controls

| Input | Action |
|-------|--------|
| Click | Select and move pieces |
| W / A / S / D or Arrow Keys | Move the board cursor |
| Enter | Select or confirm |
| Esc | Cancel selection |
| R | Open rules |
| V | New game |
| E | Skip tanker deployment |

---

## Project Structure

```
web-app/
├── index.html        # Structure
├── style.css         # Styling
├── main.js           # UI and event handling
├── game.js           # Game logic module (pure functions)
└── resource/         # Images, fonts, audio
game_test.js          # Unit tests (Mocha + Chai)
```

---

## Image References

All photographs used in this project were taken by Jiashuo Meng, except where noted below.

NATO Tigers Association. *Welcome to the NATO Tigers*. NATO Tigers Association; [cited 2026 Jun 25]. Available from: <https://www.natotigers.org/>
*(Used as background image for the Classic mode selection card)*

Garside J. Airbus eyes Air Combat Cloud role on Tempest. Jane's; [cited 2026 Jun 25]. Available from: <https://www.janes.com/defence-intelligence-insights/defence-news/airbus-eyes-air-combat-cloud-role-on-tempest>
*(Used as background image for the Real Battle mode selection card)*