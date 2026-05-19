/**
 * @fileoverview Aircraft Chess — Web Application controller.
 * @author Jiashuo Meng
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

    // Rules modal bindings
    document.getElementById("show-rules")
        .addEventListener("click", showRulesModal);
    document.getElementById("close-rules")
        .addEventListener("click", hideRulesModal);
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            hideRulesModal();
        }
    });

    render(gameState);

    // Open the rules modal on first load — gives new players a quick tour
    showRulesModal();
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
        render(gameState);
        return;
    }

    // Move succeeded — render new state, then play capture effects if applicable
    selectedCell = null;
    const capturedAt = getCaptureTarget(previous, gameState);
    render(gameState);
    if (capturedAt !== null) {
        triggerExplosion(capturedAt);
        playBoomSound();
        shakeBoard();
    }
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
 *  RULES MODAL
 * ========================================================================= */

function showRulesModal() {
    document.getElementById("rules-modal").removeAttribute("hidden");

    document.querySelector(".rules-content").scrollTop = 0;

    document.getElementById("close-rules").focus({ preventScroll: true });
}

function hideRulesModal() {
    document.getElementById("rules-modal").setAttribute("hidden", "");
}
/* =========================================================================
 *  RENDERING
 * ========================================================================= */

function render(state) {
    renderBoard(state);
    renderStatus(state);
    renderTankerStatus(state);
    renderCapturedPieces(state);
    renderGameOver(state);
    renderSkipButton(state);
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

function renderTankerStatus(state) {
    [1, 2].forEach(function (player) {
        const display = document.getElementById("tanker-status-p" + player);
        const carried = Game.getCarriedPlane(state, player);
        if (carried === null) {
            display.textContent = "empty";
            display.classList.remove("tanker-loaded");
        } else {
            display.textContent = carried.type;
            display.classList.add("tanker-loaded");
        }
    });
}

function renderSkipButton(state) {
    const button = document.getElementById("skip-deploy");
    button.disabled = !Game.canDeploy(state);
    button.classList.toggle("button-active", Game.canDeploy(state));
    button.classList.toggle("button-disabled", !Game.canDeploy(state));
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
 *  CAPTURE EFFECTS — explosion, sound, screen shake
 *  All three fire together on capture for maximum impact.
 * ========================================================================= */

/**
 * Diff move histories to detect a newly added capture entry.
 * @returns {Position|null}
 */
function getCaptureTarget(previousState, newState) {
    const oldHistory = Game.getMoveHistory(previousState);
    const newHistory = Game.getMoveHistory(newState);
    if (newHistory.length <= oldHistory.length) {
        return null;
    }
    for (let i = newHistory.length - 1; i >= oldHistory.length; i -= 1) {
        if (newHistory[i].kind === "capture") {
            return newHistory[i].to;
        }
    }
    return null;
}

/**
 * Spawn a fireball + shockwave at the centre of the given board cell.
 */
function triggerExplosion(pos) {
    const cell = document.querySelector(
        ".cell[data-row=\"" + pos.row + "\"][data-col=\"" + pos.col + "\"]"
    );
    if (cell === null) {
        return;
    }

    const rect = cell.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const fireball = document.createElement("div");
    fireball.className = "explosion";
    fireball.style.left = centerX + "px";
    fireball.style.top = centerY + "px";
    document.body.appendChild(fireball);

    const shockwave = document.createElement("div");
    shockwave.className = "shockwave";
    shockwave.style.left = centerX + "px";
    shockwave.style.top = centerY + "px";
    document.body.appendChild(shockwave);

    setTimeout(function () {
        fireball.remove();
        shockwave.remove();
    }, 800);
}

/**
 * Briefly add a class to the board to trigger the shake keyframe.
 * Reflow trick: removing-then-adding the class lets the animation
 * replay cleanly on rapid consecutive captures.
 */
function shakeBoard() {
    const board = document.getElementById("board");
    board.classList.remove("board-shaking");
    void board.offsetWidth;  // force reflow
    board.classList.add("board-shaking");

    setTimeout(function () {
        board.classList.remove("board-shaking");
    }, 500);
}

/**
 * Play the boom sound effect from the resource folder.
 */
function playBoomSound() {
    const audio = new Audio("resource/sound.mp3");
    audio.volume = 0.6;
    audio.play().catch(function () { });
}

// window.Game = Game;   // Uncomment for console debugging

init();