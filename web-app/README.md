# Aircraft Chess

Welcome to play the Aircraft Chess game! This is a turn-based chess-like game, but every piece is not a king or queen, every piece is a millitary aircraft, very cool. The game is happen on a 8x8 grid board, two player take turn one by one, until someone capture the enermy's Command aircraft, then he win, very simple to understand.

## How to start

Open `index.html` in your browser, the board will show up and Player 1 go first. Click your aircraft to see where it can fly to (the highlight squares), then click a target square to move there. If you click an enermy piece that is reachable, your aircraft will capture it and the enermy piece will be remove from board.

## The aircrafts

Every player have these five kind of aircraft, each one move in different way:

- **Fighter** — fly in an L-shape (like the knight in normal chess), and is the only piece who can jump over the other pieces. Fighter also can do a "Lock-on attack": instead of moving, it can destroy any enermy aircraft standing next to it (in the eight surrounding squares) without moving itself.
- **Bomber** — fly up to two square along the row or column. After it move, it become tired and must rest one turn (you cannot move the same Bomber again next turn, you must move other piece first).
- **Recon** — fly up to two square diagonally.
- **Tanker** — fly only one square in any direction. Special skill: it can carry one friendly aircraft (not Command) on board with it! When friendly piece move onto the Tanker, it get loaded; then on a later turn the Tanker can deploy (drop off) it pessenger to any empty square next to the Tanker.
- **Command** — the most important aircraft, fly one square in any direction. If your Command get captured, you lose immediately, so protect him well!

## Winning condition

The game finish when one player's Command aircraft is captured by the opponent. The player who captured become the winner, and the game status will change to show who win.

## Project files

- `index.html` — the main page of the web app
- `main.js` — handle the user interface and click events
- `game.js` — the game module, contain all rule logic of Aircraft Chess (pure functions, never mutate state)
- `style.css` — styling for the board and pieces
- `resource/` — images, fonts and sounds use by the game
- `tests/` — unit test specifications and implementations for the game module

Have fun and good luck commanding your air force!
