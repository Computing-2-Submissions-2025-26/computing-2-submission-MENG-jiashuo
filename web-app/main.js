/**
 * @fileoverview Aircraft Chess — Web Application controller.
 * @author Jiashuo Meng
 */

import * as Game from "./game.js";

/* =========================================================================
 *  SCORING CONFIG
 *  Adjust these values to tune the strategic weight of each piece type.
 * ========================================================================= */

const PIECE_VALUES = {
    fighter: 2,
    recon: 2,
    bomber: 3,
    tanker: 4,
    command: 10
};

/* =========================================================================
 *  MUTABLE UI / SESSION STATE
 * ========================================================================= */

let gameState = Game.createInitialGame();
let selectedCell = null;
let cursorPos = { row: 0, col: 0 };
let inputMode = "mouse";

// Session-level scores. Persist across multiple games within the same
// page load; cleared only when the user refreshes.
let sessionScores = { 1: 0, 2: 0 };

// Player who lost the most recent finished game. Used as a tiebreaker
// when both players have the same score.
let lastLoser = null;

// Turn timer state
const TURN_TIME = 90;
let timerInterval = null;
let timeLeft = TURN_TIME;

// BGM state
let bgmEnabled = true;

// Player display names — set once at session start via the name-entry modal
let playerNames = { 1: "Player 1", 2: "Player 2" };

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

    document.getElementById("show-rules")
        .addEventListener("click", showRulesModal);
    document.getElementById("close-rules")
        .addEventListener("click", hideRulesModal);
    document.getElementById("toggle-bgm")
        .addEventListener("click", toggleBGM);
    document.getElementById("confirm-names")
        .addEventListener("click", handleNameEntry);
    const inp1 = document.getElementById("name-p1");
    inp1.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { document.getElementById("name-p2").focus(); }
    });
    const inp2 = document.getElementById("name-p2");
    inp2.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { handleNameEntry(); }
    });

    document.addEventListener("mousedown", function () {
        if (inputMode !== "mouse") {
            inputMode = "mouse";
            render(gameState);
        }
    });

    document.addEventListener("keydown", function (event) {
        if (event.target.tagName === "INPUT") {
            return;
        }

        inputMode = "keyboard";

        const rulesModal = document.getElementById("rules-modal");
        const nameModal = document.getElementById("name-entry-modal");
        const rulesOpen = !rulesModal.hasAttribute("hidden");
        const nameOpen = !nameModal.hasAttribute("hidden");

        if (event.key === "Escape") {
            if (rulesOpen) {
                hideRulesModal();
            } else if (!nameOpen) {
                selectedCell = null;
                render(gameState);
            }
            return;
        }

        if (rulesOpen || nameOpen) {
            return;
        }

        if (event.key === "r" || event.key === "R") {
            event.preventDefault();
            showRulesModal();
            return;
        }

        if (event.key === "v" || event.key === "V") {
            event.preventDefault();
            handleNewGame();
            return;
        }

        if (event.key === "e" || event.key === "E") {
            event.preventDefault();
            if (Game.canDeploy(gameState)) {
                handleSkipDeploy();
            }
            return;
        }

        let dr = 0;
        let dc = 0;
        if (event.key === "w" || event.key === "W"
                || event.key === "ArrowUp") {
            dr = -1;
        } else if (event.key === "s" || event.key === "S"
                || event.key === "ArrowDown") {
            dr = 1;
        } else if (event.key === "a" || event.key === "A"
                || event.key === "ArrowLeft") {
            dc = -1;
        } else if (event.key === "d" || event.key === "D"
                || event.key === "ArrowRight") {
            dc = 1;
        }

        if (dr !== 0 || dc !== 0) {
            event.preventDefault();
            moveCursor(dr, dc);
            const sel = "[data-row=\"" + cursorPos.row
                + "\"][data-col=\"" + cursorPos.col + "\"]";
            const target = document.querySelector(".cell" + sel);
            if (target) {
                target.focus({ preventScroll: true });
            }
            render(gameState);
            return;
        }

        if (event.key === "Enter") {
            const focused = document.activeElement;
            if (focused && focused.classList.contains("cell")) {
                return;
            }
            event.preventDefault();
            activateCell(cursorPos);
        }
    });

    initBGM();
    render(gameState);

    showNameEntryModal();
}

/* =========================================================================
 *  EVENT HANDLERS
 * ========================================================================= */

function handleCellClick(pos) {
    activateCell(pos);
}

function activateCell(pos) {
    if (Game.isGameOver(gameState)) {
        return;
    }

    if (Game.canDeploy(gameState)) {
        const prevDeploy = gameState;
        gameState = Game.deployPlane(gameState, pos);
        if (gameState !== prevDeploy) {
            selectedCell = null;
            render(gameState);
            if (Game.isGameOver(gameState)) {
                lastLoser = Game.getWinner(gameState) === 1 ? 2 : 1;
                stopTimer();
            } else {
                startTimer();
            }
        }
        return;
    }

    if (selectedCell === null) {
        const piece = Game.getPieceAt(gameState, pos);
        const cp = Game.getCurrentPlayer(gameState);
        if (piece !== null && piece.owner === cp) {
            selectedCell = pos;
            render(gameState);
        }
        return;
    }

    // Lock-on attack: Fighter destroys an adjacent enemy in place
    const selPiece = Game.getPieceAt(gameState, selectedCell);
    if (selPiece !== null && selPiece.type === "fighter") {
        const lockOns = Game.getLockOnTargets(gameState, selectedCell);
        if (lockOns.some((t) => t.row === pos.row && t.col === pos.col)) {
            const previous = gameState;
            gameState = Game.lockOnAttack(gameState, selectedCell, pos);
            updateScoresFromCaptures(previous, gameState);
            selectedCell = null;
            const capturedAt = getCaptureTarget(previous, gameState);
            render(gameState);
            if (capturedAt !== null) {
                triggerExplosion(capturedAt);
                playBoomSound();
                shakeBoard();
            }
            if (Game.isGameOver(gameState)) {
                lastLoser = Game.getWinner(gameState) === 1 ? 2 : 1;
                stopTimer();
            } else {
                startTimer();
            }
            return;
        }
    }

    const previous = gameState;
    gameState = Game.makeMove(gameState, selectedCell, pos);

    if (gameState === previous) {
        const piece = Game.getPieceAt(gameState, pos);
        const cp = Game.getCurrentPlayer(gameState);
        if (piece !== null && piece.owner === cp) {
            selectedCell = pos;
        } else {
            selectedCell = null;
        }
        render(gameState);
        return;
    }

    // Move succeeded — update scores from any new captures, then render
    updateScoresFromCaptures(previous, gameState);

    selectedCell = null;
    const capturedAt = getCaptureTarget(previous, gameState);
    render(gameState);
    if (capturedAt !== null) {
        triggerExplosion(capturedAt);
        playBoomSound();
        shakeBoard();
    }

    if (Game.isGameOver(gameState)) {
        lastLoser = Game.getWinner(gameState) === 1 ? 2 : 1;
        stopTimer();
    } else {
        startTimer();
    }
}

function handleSkipDeploy() {
    gameState = Game.skipDeploy(gameState);
    selectedCell = null;
    render(gameState);
    if (!Game.isGameOver(gameState)) {
        startTimer();
    }
}

function handleNewGame() {
    const initial = Game.createInitialGame();
    const starter = determineNextStarter();
    gameState = { ...initial, currentPlayer: starter };
    selectedCell = null;
    render(gameState);
    startTimer();
}

/* =========================================================================
 *  SCORING LOGIC
 * ========================================================================= */

/**
 * Diff the move histories between two states. For every newly added
 * "capture" entry, credit the moving player the captured piece's
 * value. Handles double-captures (loaded tanker case) automatically.
 */
function updateScoresFromCaptures(previousState, newState) {
    const oldHistory = Game.getMoveHistory(previousState);
    const newHistory = Game.getMoveHistory(newState);
    const newEntries = newHistory.slice(oldHistory.length);

    // The capturer is whoever was on move BEFORE the action — read it
    // from the previous state, since capturing the Command does not
    // pass the turn.
    const capturer = Game.getCurrentPlayer(previousState);

    newEntries
        .filter((entry) => entry.kind === "capture")
        .forEach(function (entry) {
            const value = PIECE_VALUES[entry.captured.type] || 0;
            sessionScores[capturer] += value;
        });
}

/**
 * Decide which player should make the first move of the next game.
 * Rules, in order:
 *   1. Lower score starts (catch-up advantage).
 *   2. Tied? Use the loser of the previous game.
 *   3. Still no info (first ever game)? Default to Player 1.
 */
function determineNextStarter() {
    if (sessionScores[1] < sessionScores[2]) {
        return 1;
    }
    if (sessionScores[2] < sessionScores[1]) {
        return 2;
    }
    return lastLoser !== null ? lastLoser : 1;
}

/* =========================================================================
 *  RULES MODAL
 * ========================================================================= */

function showRulesModal() {
    stopTimer();
    document.getElementById("rules-modal").removeAttribute("hidden");
    document.querySelector(".rules-content").scrollTop = 0;
    document.getElementById("close-rules").focus({ preventScroll: true });
}

function hideRulesModal() {
    document.getElementById("rules-modal").setAttribute("hidden", "");
    if (!Game.isGameOver(gameState)) {
        startTimer();
    }
}

/* =========================================================================
 *  NAME ENTRY MODAL
 * ========================================================================= */

function showNameEntryModal() {
    stopTimer();
    document.getElementById("name-entry-modal").removeAttribute("hidden");
    document.getElementById("name-p1").focus();
}

function hideNameEntryModal() {
    document.getElementById("name-entry-modal").setAttribute("hidden", "");
}

function handleNameEntry() {
    const n1 = document.getElementById("name-p1").value.trim();
    const n2 = document.getElementById("name-p2").value.trim();
    playerNames[1] = n1 || "Player 1";
    playerNames[2] = n2 || "Player 2";
    updateStaticNameLabels();
    render(gameState);
    hideNameEntryModal();
    showRulesModal();
}

function updateStaticNameLabels() {
    document.getElementById("label-force-p1").textContent = playerNames[1];
    document.getElementById("label-force-p2").textContent = playerNames[2];
    document.getElementById("tname-p1").textContent = playerNames[1];
    document.getElementById("tname-p2").textContent = playerNames[2];
    document.getElementById("cap-title-p1").textContent =
        playerNames[1] + " lost";
    document.getElementById("cap-title-p2").textContent =
        playerNames[2] + " lost";
}

/* =========================================================================
 *  BACKGROUND MUSIC
 * ========================================================================= */

function initBGM() {
    const bgm = document.getElementById("bgm");
    if (!bgm) {
        return;
    }
    bgm.volume = 0.25;

    // Attempt immediately — will be silently rejected if no user gesture yet.
    bgm.play().catch(function () {});

    // On every click (capture phase = fires before any handler),
    // resume if the browser's autoplay policy had blocked or paused it.
    document.addEventListener("click", function () {
        if (bgmEnabled && bgm.paused) {
            bgm.play().catch(function () {});
        }
    }, true);

    updateBGMButton();
}

function toggleBGM() {
    const bgm = document.getElementById("bgm");
    if (!bgm) {
        return;
    }
    bgmEnabled = !bgmEnabled;
    if (bgmEnabled) {
        bgm.play().catch(function () {});
    } else {
        bgm.pause();
    }
    updateBGMButton();
}

function updateBGMButton() {
    const btn = document.getElementById("toggle-bgm");
    if (!btn) {
        return;
    }
    btn.textContent = bgmEnabled ? "🔊" : "🔇";
    btn.setAttribute(
        "aria-label", bgmEnabled ? "Mute music" : "Unmute music"
    );
    btn.classList.toggle("bgm-muted", !bgmEnabled);
}

/* =========================================================================
 *  TURN TIMER
 * ========================================================================= */

function startTimer() {
    clearInterval(timerInterval);
    timeLeft = TURN_TIME;

    // Snap bar to full instantly (bypass CSS transition)
    const fill = document.getElementById("timer-fill");
    if (fill) {
        fill.style.transition = "none";
        fill.style.width = "100%";
        requestAnimationFrame(function () {
            fill.style.transition = "";
        });
    }

    updateTimerDisplay();

    timerInterval = setInterval(function () {
        timeLeft = Math.max(0, timeLeft - 1);
        updateTimerDisplay();
        if (timeLeft === 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            executeRandomMove();
        }
    }, 1000);
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
}

function updateTimerDisplay() {
    const digits = document.getElementById("timer-digits");
    const fill = document.getElementById("timer-fill");
    const display = document.getElementById("timer-display");
    const track = document.getElementById("timer-track");

    if (!digits || !fill || !display) {
        return;
    }

    digits.textContent = String(timeLeft).padStart(2, "0");
    fill.style.width = ((timeLeft / TURN_TIME) * 100) + "%";

    if (track) {
        track.setAttribute("aria-valuenow", String(timeLeft));
    }

    display.classList.remove("timer-warning", "timer-danger");
    if (timeLeft <= 10) {
        display.classList.add("timer-danger");
    } else if (timeLeft <= 30) {
        display.classList.add("timer-warning");
    }
}

function executeRandomMove() {
    if (Game.isGameOver(gameState)) {
        return;
    }

    // Deploy phase: pick a random target or skip
    if (Game.canDeploy(gameState)) {
        const targets = Game.getDeployTargets(gameState);
        if (targets.length > 0 && Math.random() > 0.3) {
            const t = targets[Math.floor(Math.random() * targets.length)];
            gameState = Game.deployPlane(gameState, t);
        } else {
            gameState = Game.skipDeploy(gameState);
        }
        selectedCell = null;
        render(gameState);
        if (!Game.isGameOver(gameState)) {
            startTimer();
        }
        return;
    }

    // Collect every piece of the current player that has a legal move
    const currentPlayer = Game.getCurrentPlayer(gameState);
    const candidates = [];

    for (let r = 0; r < 8; r += 1) {
        for (let c = 0; c < 8; c += 1) {
            const piece = Game.getPieceAt(gameState, { row: r, col: c });
            if (piece !== null && piece.owner === currentPlayer) {
                const moves = Game.getLegalMoves(
                    gameState, { row: r, col: c }
                );
                if (moves.length > 0) {
                    candidates.push({ from: { row: r, col: c }, moves });
                }
            }
        }
    }

    if (candidates.length === 0) {
        startTimer();
        return;
    }

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const move = pick.moves[Math.floor(Math.random() * pick.moves.length)];

    const previous = gameState;
    gameState = Game.makeMove(gameState, pick.from, move);
    updateScoresFromCaptures(previous, gameState);

    selectedCell = null;
    const capturedAt = getCaptureTarget(previous, gameState);
    render(gameState);

    if (capturedAt !== null) {
        triggerExplosion(capturedAt);
        playBoomSound();
        shakeBoard();
    }

    if (Game.isGameOver(gameState)) {
        lastLoser = Game.getWinner(gameState) === 1 ? 2 : 1;
        stopTimer();
        return;
    }

    startTimer();
}

/* =========================================================================
 *  RENDERING
 * ========================================================================= */

function render(state) {
    snapCursor(state);
    renderBoard(state);
    renderStatus(state);
    renderTankerStatus(state);
    renderRanking();
    renderCapturedPieces(state);
    renderGameOver(state);
    renderSkipButton(state);
}

function isSamePos(a, b) {
    return a !== null && b !== null && a.row === b.row && a.col === b.col;
}

/* =========================================================================
 *  SMART CURSOR HELPERS
 * ========================================================================= */

function getValidCursorCells(state) {
    if (Game.isGameOver(state)) {
        return [];
    }
    if (Game.canDeploy(state)) {
        return Game.getDeployTargets(state);
    }
    if (selectedCell !== null) {
        const moves = Game.getLegalMoves(state, selectedCell);
        const lockOns = Game.getLockOnTargets(state, selectedCell);
        return moves.concat(lockOns.filter(function (lo) {
            return !moves.some(function (m) {
                return m.row === lo.row && m.col === lo.col;
            });
        }));
    }
    const cp = Game.getCurrentPlayer(state);
    const cells = [];
    for (let r = 0; r < 8; r += 1) {
        for (let c = 0; c < 8; c += 1) {
            const piece = Game.getPieceAt(state, { row: r, col: c });
            if (piece !== null && piece.owner === cp) {
                cells.push({ row: r, col: c });
            }
        }
    }
    return cells;
}

function snapCursor(state) {
    const valid = getValidCursorCells(state);
    if (valid.length === 0) {
        return;
    }
    const isValid = valid.some(function (p) {
        return p.row === cursorPos.row && p.col === cursorPos.col;
    });
    if (!isValid) {
        let nearest = valid[0];
        let nearestDist = Infinity;
        valid.forEach(function (p) {
            const dr = p.row - cursorPos.row;
            const dc = p.col - cursorPos.col;
            const dist = dr * dr + dc * dc;
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = p;
            }
        });
        cursorPos = nearest;
    }
}

function moveCursor(dr, dc) {
    const valid = getValidCursorCells(gameState);
    if (valid.length === 0) {
        return;
    }
    const cur = cursorPos;
    let best = null;
    let bestPrimary = Infinity;
    let bestSecondary = Infinity;

    valid.forEach(function (p) {
        if (dr < 0 && p.row >= cur.row) { return; }
        if (dr > 0 && p.row <= cur.row) { return; }
        if (dc < 0 && p.col >= cur.col) { return; }
        if (dc > 0 && p.col <= cur.col) { return; }

        const primary = dr !== 0
            ? Math.abs(p.row - cur.row)
            : Math.abs(p.col - cur.col);
        const secondary = dr !== 0
            ? Math.abs(p.col - cur.col)
            : Math.abs(p.row - cur.row);

        if (primary < bestPrimary
                || (primary === bestPrimary
                    && secondary < bestSecondary)) {
            bestPrimary = primary;
            bestSecondary = secondary;
            best = p;
        }
    });

    if (best !== null) {
        cursorPos = best;
    }
}

function pieceDescription(piece) {
    return playerNames[piece.owner] + " " + piece.type;
}

function renderBoard(state) {
    const legalTargets = (selectedCell !== null && !Game.canDeploy(state))
        ? Game.getLegalMoves(state, selectedCell)
        : [];
    const lockOnTargets = (selectedCell !== null && !Game.canDeploy(state))
        ? Game.getLockOnTargets(state, selectedCell)
        : [];
    const deployTargets = Game.canDeploy(state)
        ? Game.getDeployTargets(state)
        : [];
    const currentPlayer = Game.getCurrentPlayer(state);
    const cooldownPos = Game.getCooldownBomber(state, currentPlayer);
    const validCursorCells = getValidCursorCells(state);

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
            cell.classList.add("piece-p" + piece.owner);

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
        if (lockOnTargets.some((p) => p.row === row && p.col === col)) {
            cell.classList.add("cell-lockon");
        }
        if (deployTargets.some((p) => p.row === row && p.col === col)) {
            cell.classList.add("cell-deploy-target");
        }
        if (isCooldownHere) {
            cell.classList.add("cell-cooldown");
        }
        if (inputMode === "keyboard"
                && validCursorCells.length > 0
                && isSamePos(cursorPos, { row: row, col: col })) {
            cell.classList.add("cell-cursor");
        }
    });
}

function renderStatus(state) {
    const currentPlayer = Game.getCurrentPlayer(state);


    document.getElementById("current-player").textContent =
        playerNames[currentPlayer];
    document.getElementById("current-player")
        .classList.toggle("player2-turn", currentPlayer === 2);
    document.getElementById("status-panel")
        .classList.toggle("player2-turn", currentPlayer === 2);
    document.getElementById("board")
        .classList.toggle("player2-turn", currentPlayer === 2);
    document.getElementById("label-p1")
        .classList.toggle("is-active", currentPlayer === 1);
    document.getElementById("label-p2")
        .classList.toggle("is-active", currentPlayer === 2);


    const msg = document.getElementById("status-message");

    if (Game.isGameOver(state)) {
        msg.textContent =
            "Game over: " + playerNames[Game.getWinner(state)] + " wins!";
        return;
    }
    if (Game.canDeploy(state)) {
        msg.textContent = "Deploy phase — choose a target or skip";
        return;
    }
    if (selectedCell !== null) {
        const cooldownPos = Game.getCooldownBomber(state, currentPlayer);
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

/**
 * Render the session ranking board. Sorts players by score (descending)
 * so the leader appears first; highlights the leading row when there
 * is a clear winner.
 */
function renderRanking() {
    const board = document.getElementById("ranking-board");
    if (board === null) {
        return;
    }
    board.innerHTML = "";

    // Sort descending by score; ties keep P1 above P2
    const ranked = [
        { id: 1, score: sessionScores[1] },
        { id: 2, score: sessionScores[2] }
    ].sort((a, b) => b.score - a.score);

    const tied = ranked[0].score === ranked[1].score;

    ranked.forEach(function (entry, index) {
        const row = document.createElement("div");
        row.className = "rank-row";
        if (!tied && index === 0) {
            row.classList.add("rank-leader");
        }

        const position = document.createElement("span");
        position.className = "rank-position";
        position.textContent = tied ? "—" : (index === 0 ? "1st" : "2nd");

        const name = document.createElement("span");
        name.className = "rank-name";
        name.textContent = playerNames[entry.id];

        const score = document.createElement("span");
        score.className = "rank-score";
        score.textContent = entry.score + " pts";

        row.appendChild(position);
        row.appendChild(name);
        row.appendChild(score);
        board.appendChild(row);
    });
}

function renderSkipButton(state) {
    const button = document.getElementById("skip-deploy");
    button.disabled = !Game.canDeploy(state);
    button.classList.toggle("button-active", Game.canDeploy(state));
    button.classList.toggle("button-disabled", !Game.canDeploy(state));
}

const ROSTER_ORDER = [
    "fighter", "recon", "bomber", "tanker",
    "command",
    "bomber", "recon", "fighter"
];

function renderCapturedPieces(state) {
    [1, 2].forEach(function (player) {
        const list = document.getElementById("captured-p" + player);
        list.innerHTML = "";

        const killedCounts = {};
        Game.getCapturedPieces(state, player).forEach(function (piece) {
            killedCounts[piece.type] = (killedCounts[piece.type] || 0) + 1;
        });

        const renderedKilled = {};
        ROSTER_ORDER.forEach(function (type) {
            const li = document.createElement("li");
            const img = document.createElement("img");
            img.src = "resource/p" + player + "_" + type + ".png";
            img.alt = type;

            const alreadyLit = renderedKilled[type] || 0;
            if (alreadyLit < (killedCounts[type] || 0)) {
                li.classList.add("piece-killed");
                renderedKilled[type] = alreadyLit + 1;
            } else {
                li.classList.add("piece-alive");
            }

            li.appendChild(img);
            list.appendChild(li);
        });
    });
}

function renderGameOver(state) {
    const overlay = document.getElementById("game-over-overlay");
    if (Game.isGameOver(state)) {
        const winner = Game.getWinner(state);
        document.getElementById("winner-message").textContent =
            playerNames[winner] + " Wins";
        overlay.classList.toggle("player2-wins", winner === 2);
        overlay.removeAttribute("hidden");
    } else {
        overlay.classList.remove("player2-wins");
        overlay.setAttribute("hidden", "");
    }
}

/* =========================================================================
 *  CAPTURE EFFECTS — explosion, sound, screen shake
 * ========================================================================= */

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

function shakeBoard() {
    const board = document.getElementById("board");
    board.classList.remove("board-shaking");
    void board.offsetWidth;
    board.classList.add("board-shaking");

    setTimeout(function () {
        board.classList.remove("board-shaking");
    }, 500);
}

function playBoomSound() {
    const audio = new Audio("resource/sound.mp3");
    audio.volume = 0.6;
    audio.play().catch(function () { });
}

// window.Game = Game;   // Uncomment for console debugging

init();