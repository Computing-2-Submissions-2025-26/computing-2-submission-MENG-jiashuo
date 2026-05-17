/**
 * @fileoverview Aircraft Chess — Web Application controller.
    *author: Jiashuo Meng
 */

import * as Game from "./game.js";

/* =========================================================================
 *  MUTABLE UI STATE
 * ========================================================================= */

let gameState = Game.createInitialGame();
let selectedCell = null;

/* =========================================================================
 *  INITIALISATION
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
 *  EVENT HANDLERS
 * ========================================================================= */

function handleCellClick(pos) {
    if (Game.isGameOver(gameState)) {
        return;
    }

    if (Game.canDeploy(gameState)) {
        gameState = Game.deployPlane(gameState, pos);
        selectedCell = null;
        render(gameState);
        return;
    }

    if (selectedCell === null) {
        const piece = Game.getPieceAt(gameState, pos);
        if (piece !== null && piece.owner === Game.getCurrentPlayer(gameState)) {
            selectedCell = pos;
            render(gameState);
        }
        return;
    }

    const previous = gameState;
    gameState = Game.makeMove(gameState, selectedCell, pos);

    if (gameState === previous) {
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
 *  RENDERING
 * ========================================================================= */

function render(state) {
    renderBoard(state);
    renderStatus(state);
    renderTankerStatus(state);
    renderDeployPanel(state);
    renderCapturedPieces(state);
    renderGameOver(state);
}

function isSamePos(a, b) {
    return a !== null && b !== null && a.row === b.row && a.col === b.col;
}

function pieceDescription(piece) {
    return "Player " + piece.owner + " " + piece.type;
}

function renderBoard(state) {
    const legalTargets = (selectedCell !== null && !Game.canDeploy(state))
        ? Game.getLegalMoves(state, selectedCell)
        : [];
    const deployTargets = Game.canDeploy(state)
        ? Game.getDeployTargets(state)
        : [];
    const currentPlayer = Game.getCurrentPlayer(state);
    const cooldownPos = Game.getCooldownBomber(state, currentPlayer);

    document.querySelectorAll(".cell").forEach(function (cell) {
        const row = Number(cell.dataset.row);
        const col = Number(cell.dataset.col);
        const piece = Game.getPieceAt(state, { row: row, col: col });
        const isLight = (row + col) % 2 === 0;

        cell.innerHTML = "";
        cell.className = "cell " + (isLight ? "cell-light" : "cell-dark");

        const isCooldownHere = isSamePos(cooldownPos, { row: row, col: col });

        if (piece !== null) {
            const img = document.createElement("img");
            img.src = "resource/p" + piece.owner + "_" + piece.type + ".png";
            img.alt = "";
            cell.appendChild(img);
            cell.classList.add("cell-has-piece");

            const restingNote = isCooldownHere
                ? " (resting, cannot move this turn)"
                : "";
            cell.setAttribute(
                "aria-label",
                pieceDescription(piece) + restingNote
                + " at row " + (row + 1) + " column " + (col + 1)
            );
        } else {
            cell.setAttribute(
                "aria-label",
                "Empty square at row " + (row + 1) + " column " + (col + 1)
            );
        }

        if (isSamePos(selectedCell, { row: row, col: col })) {
            cell.classList.add("cell-selected");
        }
        if (legalTargets.some((p) => p.row === row && p.col === col)) {
            cell.classList.add("cell-legal");
        }
        if (deployTargets.some((p) => p.row === row && p.col === col)) {
            cell.classList.add("cell-deploy-target");
        }
        if (isCooldownHere) {
            cell.classList.add("cell-cooldown");
        }
    });
}

function renderStatus(state) {
    document.getElementById("current-player").textContent =
        "Player " + Game.getCurrentPlayer(state);

    const msg = document.getElementById("status-message");

    if (Game.isGameOver(state)) {
        msg.textContent = "Game over: Player " + Game.getWinner(state) + " wins!";
        return;
    }
    if (Game.canDeploy(state)) {
        msg.textContent = "Deploy phase — choose a target or skip";
        return;
    }
    if (selectedCell !== null) {
        const cooldownPos = Game.getCooldownBomber(state, Game.getCurrentPlayer(state));
        if (isSamePos(cooldownPos, selectedCell)) {
            msg.textContent = "This bomber is resting — choose another piece";
            return;
        }
        msg.textContent = "Click a highlighted square to move";
        return;
    }
    msg.textContent = "Click a piece to select";
}

/**
 * Persistent indicator: shows the current player's tanker cargo
 * (or "empty")
 */
function renderTankerStatus(state) {
    const display = document.getElementById("tanker-status");
    const player = Game.getCurrentPlayer(state);
    const carried = Game.getCarriedPlane(state, player);

    if (carried === null) {
        display.textContent = "Your tanker: empty";
        display.classList.remove("tanker-loaded");
    } else {
        display.textContent = "Your tanker carries: " + carried.type;
        display.classList.add("tanker-loaded");
    }
}

function renderDeployPanel(state) {
    const panel = document.getElementById("deploy-panel");

    if (!Game.canDeploy(state)) {
        panel.setAttribute("hidden", "");
        return;
    }

    panel.removeAttribute("hidden");

    // Populate the prominent carrying display
    const carried = Game.getCarriedPlane(state, Game.getCurrentPlayer(state));
    if (carried !== null) {
        const icon = document.getElementById("carried-piece-icon");
        icon.src = "resource/p" + carried.owner + "_" + carried.type + ".png";
        icon.alt = "";
        document.getElementById("carried-piece-label").textContent = carried.type;
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

// window.Game = Game;   // Uncomment for console debugging

init();