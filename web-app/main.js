import * as Game from "./game.js";
window.Game = Game;
/**
 * @fileoverview Aircraft Chess — Web Application controller.
 *
 * The bridge between the DOM and the pure game module. This file owns
 * two pieces of mutable state — the current game state and the
 * currently selected cell — but contains no game logic: every rule of
 * the game lives in game.js. The pattern is `render(state)`: given a
 * fresh game state, redraw the UI to match it.
 */


/* =========================================================================
 *  MUTABLE UI STATE — not part of the pure game state
 * ========================================================================= */

let gameState = Game.createInitialGame();
let selectedCell = null;

/* =========================================================================
 *  INITIALISATION — runs once at load
 * ========================================================================= */

function init() {
    const board = document.getElementById("board");

    for (let r = 0; r < 8; r += 1) {
        for (let c = 0; c < 8; c += 1) {
            const cell = document.createElement("button");
            cell.type = "button";
            cell.className = "cell";
            cell.dataset.row = String(r);
            cell.dataset.col = String(c);
            cell.addEventListener("click", function () {
                handleCellClick({ row: r, col: c });
            });
            board.appendChild(cell);
        }
    }

    document.getElementById("skip-deploy")
        .addEventListener("click", handleSkipDeploy);
    document.getElementById("new-game")
        .addEventListener("click", handleNewGame);
    document.getElementById("new-game-overlay")
        .addEventListener("click", handleNewGame);

    render(gameState);
}

/* =========================================================================
 *  EVENT HANDLERS — minimal logic; delegate to the game module
 * ========================================================================= */

function handleCellClick(pos) {
    if (Game.isGameOver(gameState)) {
        return;
    }

    // Deploy phase: a click either deploys to a valid target or does nothing.
    if (Game.canDeploy(gameState)) {
        gameState = Game.deployPlane(gameState, pos);
        selectedCell = null;
        render(gameState);
        return;
    }

    // No piece selected yet: try to select the clicked piece.
    if (selectedCell === null) {
        const piece = Game.getPieceAt(gameState, pos);
        if (piece !== null && piece.owner === Game.getCurrentPlayer(gameState)) {
            selectedCell = pos;
            render(gameState);
        }
        return;
    }

    // Have a selection: try to move there.
    const previous = gameState;
    gameState = Game.makeMove(gameState, selectedCell, pos);

    if (gameState === previous) {
        // Move was rejected. If the user clicked another of their own pieces,
        // reselect; otherwise clear the selection.
        const piece = Game.getPieceAt(gameState, pos);
        if (piece !== null && piece.owner === Game.getCurrentPlayer(gameState)) {
            selectedCell = pos;
        } else {
            selectedCell = null;
        }
    } else {
        selectedCell = null;
    }
    render(gameState);
}

function handleSkipDeploy() {
    gameState = Game.skipDeploy(gameState);
    selectedCell = null;
    render(gameState);
}

function handleNewGame() {
    gameState = Game.createInitialGame();
    selectedCell = null;
    render(gameState);
}

/* =========================================================================
 *  RENDERING — derive the entire UI from `state`
 * ========================================================================= */

function render(state) {
    renderBoard(state);
    renderStatus(state);
    renderDeployPanel(state);
    renderCapturedPieces(state);
    renderGameOver(state);
}

function renderBoard(state) {
    const legalTargets = (selectedCell !== null && !Game.canDeploy(state))
        ? Game.getLegalMoves(state, selectedCell)
        : [];
    const deployTargets = Game.canDeploy(state)
        ? Game.getDeployTargets(state)
        : [];

    document.querySelectorAll(".cell").forEach(function (cell) {
        const row = Number(cell.dataset.row);
        const col = Number(cell.dataset.col);
        const piece = Game.getPieceAt(state, { row: row, col: col });
        const isLight = (row + col) % 2 === 0;

        cell.innerHTML = "";
        cell.className = "cell " + (isLight ? "cell-light" : "cell-dark");

        if (piece !== null) {
            const img = document.createElement("img");
            img.src = "resource/p" + piece.owner + "_" + piece.type + ".png";
            img.alt = "";  // decorative — the button itself has aria-label
            cell.appendChild(img);
            cell.classList.add("cell-has-piece");
            cell.setAttribute(
                "aria-label",
                pieceDescription(piece) + " at row " + (row + 1)
                + " column " + (col + 1)
            );
        } else {
            cell.setAttribute(
                "aria-label",
                "Empty square at row " + (row + 1) + " column " + (col + 1)
            );
        }

        if (selectedCell !== null
            && selectedCell.row === row
            && selectedCell.col === col) {
            cell.classList.add("cell-selected");
        }
        if (legalTargets.some((p) => p.row === row && p.col === col)) {
            cell.classList.add("cell-legal");
        }
        if (deployTargets.some((p) => p.row === row && p.col === col)) {
            cell.classList.add("cell-deploy-target");
        }
    });
}

function pieceDescription(piece) {
    return "Player " + piece.owner + " " + piece.type;
}

function renderStatus(state) {
    document.getElementById("current-player").textContent =
        "Player " + Game.getCurrentPlayer(state);

    const msg = document.getElementById("status-message");
    if (Game.isGameOver(state)) {
        msg.textContent = "Game over: Player " + Game.getWinner(state) + " wins!";
    } else if (Game.canDeploy(state)) {
        msg.textContent = "Deploy phase — choose a target or skip";
    } else if (selectedCell === null) {
        msg.textContent = "Click a piece to select";
    } else {
        msg.textContent = "Click a highlighted square to move";
    }
}

function renderDeployPanel(state) {
    const panel = document.getElementById("deploy-panel");
    if (Game.canDeploy(state)) {
        panel.removeAttribute("hidden");
    } else {
        panel.setAttribute("hidden", "");
    }
}

function renderCapturedPieces(state) {
    [1, 2].forEach(function (player) {
        const list = document.getElementById("captured-p" + player);
        list.innerHTML = "";
        Game.getCapturedPieces(state, player).forEach(function (piece) {
            const li = document.createElement("li");
            const img = document.createElement("img");
            img.src = "resource/p" + piece.owner + "_" + piece.type + ".png";
            img.alt = pieceDescription(piece);
            li.appendChild(img);
            list.appendChild(li);
        });
    });
}

function renderGameOver(state) {
    const overlay = document.getElementById("game-over-overlay");
    if (Game.isGameOver(state)) {
        document.getElementById("winner-message").textContent =
            "Player " + Game.getWinner(state) + " Wins";
        overlay.removeAttribute("hidden");
    } else {
        overlay.setAttribute("hidden", "");
    }
}

/* =========================================================================
 *  Optional: expose the Game module on `window` for console debugging.
 *  Uncomment the next line if you want to call Game.* from DevTools.
 * ========================================================================= */
// window.Game = Game;

init();