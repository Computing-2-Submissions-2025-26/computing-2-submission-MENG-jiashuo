/**
 * @fileoverview Aircraft Chess — Web Application controller.
 * @author Jiashuo Meng
 */

/*jslint browser */
import Game from "./game.js";


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
 *  SESSION STATE
 * ========================================================================= */

let gameState = Game.createInitialGame();
let selectedCell = null;
let cursorPos = {col: 0, row: 0};
let inputMode = "mouse";
let rookieMode = false;
let gameMode = "classic";
let sessionScores = {"1": 0, "2": 0};
let lastLoser = null;
let timerInterval = null;
let timeLeft = 90;
let bgmEnabled = true;
let playerNames = {"1": "Player 1", "2": "Player 2"};
let timeoutAction = null;

const TURN_TIME = 90;

/* =========================================================================
 *  INITIALISATION
 * ========================================================================= */

const ROSTER_ORDER = [
    "fighter", "recon", "bomber", "tanker",
    "command",
    "bomber", "recon", "fighter"
];

function setText(id, value) {
    document.getElementById(id).textContent = value;
}

function setClass(id, className, on) {
    document.getElementById(id).classList.toggle(className, on);
}

function bindClick(id, handler) {
    document.getElementById(id).addEventListener("click", handler);
}

/**
 * Diff the move histories between two states. For every newly added
 * "capture" entry, credit the moving player the captured piece's
 * value. Handles double-captures.
 */
function updateScoresFromCaptures(previousState, newState) {
    const oldHistory = Game.getMoveHistory(previousState);
    const newHistory = Game.getMoveHistory(newState);
    const newEntries = newHistory.slice(oldHistory.length);

    // The capturer is whoever was on move BEFORE the action: read it
    // from the previous state, since capturing the Command does not
    // pass the turn. AA-zone kills use the zone owner from the record.
    const fallbackCapturer = Game.getCurrentPlayer(previousState);

    newEntries.filter(function (entry) {
        return entry.kind === "capture";
    }).forEach(function (entry) {
        const value = PIECE_VALUES[entry.captured.type] || 0;
        const scorer = (
            entry.capturer !== undefined
            ? entry.capturer
            : fallbackCapturer
        );
        sessionScores[scorer] += value;
    });
}

/**
 * Decide which player should make the first move of the next game.
 * Rules, in order:
 *   1. Lower score starts.
 *   2. first game: Default to Player 1.
 */
function determineNextStarter() {
    if (sessionScores[1] < sessionScores[2]) {
        return 1;
    }
    if (sessionScores[2] < sessionScores[1]) {
        return 2;
    }
    return (
        lastLoser !== null
        ? lastLoser
        : 1
    );
}

function hideNameEntryModal() {
    document.getElementById("name-entry-modal").setAttribute("hidden", "");
}

function updateStaticNameLabels() {
    document.getElementById("label-force-p1").textContent = playerNames[1];
    document.getElementById("label-force-p2").textContent = playerNames[2];
    document.getElementById("tname-p1").textContent = playerNames[1];
    document.getElementById("tname-p2").textContent = playerNames[2];
    setText("cap-title-p1", playerNames[1] + " lost");
    setText("cap-title-p2", playerNames[2] + " lost");
}

function updateBGMButton() {
    const btn = document.getElementById("toggle-bgm");
    if (!btn) {
        return;
    }
    document.getElementById("bgm-icon-on").hidden = !bgmEnabled;
    document.getElementById("bgm-icon-off").hidden = bgmEnabled;
    btn.setAttribute(
        "aria-label",
        (
            bgmEnabled
            ? "Mute music"
            : "Unmute music"
        )
    );
    btn.classList.toggle("bgm-muted", !bgmEnabled);
}

function initBGM() {
    const bgm = document.getElementById("bgm");
    if (!bgm) {
        return;
    }
    bgm.volume = 0.20;

    // Attempt immediately: will be silently rejected if no gesture yet.
    bgm.play().catch(function () {
        return;
    });
    document.addEventListener("click", function () {
        if (bgmEnabled && bgm.paused) {
            bgm.play().catch(function () {
                return;
            });
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
        bgm.play().catch(function () {
            return;
        });
    } else {
        bgm.pause();
    }
    updateBGMButton();
}

function updateRookieToggle() {
    const btn = document.getElementById("rookie-toggle");
    if (!btn) {
        return;
    }
    btn.classList.toggle("rookie-on", rookieMode);
    btn.setAttribute("aria-pressed", String(rookieMode));
}

function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
}

function showRulesModal() {
    stopTimer();
    document.getElementById("rules-modal").removeAttribute("hidden");
    document.querySelector(".rules-content").scrollTop = 0;
    document.getElementById("close-rules").focus({preventScroll: true});
}

function showNameEntryModal() {
    stopTimer();
    document.getElementById("name-entry-modal").removeAttribute("hidden");
    document.getElementById("name-p1").focus();
}

function updateModeSelectionButtons() {
    document.querySelectorAll(".mode-option").forEach(function (button) {
        const mode = button.getAttribute("data-mode");
        const active = mode === gameMode;
        button.classList.toggle("mode-option-selected", active);
        button.setAttribute("aria-pressed", String(active));
    });
}

function showModeSelectionModal() {
    stopTimer();
    const modal = document.getElementById("mode-selection-modal");
    if (modal) {
        updateModeSelectionButtons();
        modal.removeAttribute("hidden");
    }
}

function hideModeSelectionModal() {
    const modal = document.getElementById("mode-selection-modal");
    if (modal) {
        modal.setAttribute("hidden", "");
    }
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

function collectCandidates(currentPlayer) {
    const candidates = [];
    gameState.board.forEach(function (boardRow, r) {
        boardRow.forEach(function (ignore, c) {
            const here = {col: c, row: r};
            const piece = Game.getPieceAt(gameState, here);
            if (piece !== null && piece.owner === currentPlayer) {
                const moves = Game.getLegalMoves(gameState, here);
                if (moves.length > 0) {
                    candidates.push({from: here, moves});
                }
            }
        });
    });
    return candidates;
}

function isSamePos(a, b) {
    return a !== null && b !== null && a.row === b.row && a.col === b.col;
}

function selectableCells(state) {
    const owner = Game.getCurrentPlayer(state);
    const cells = [];
    state.board.forEach(function (boardRow, r) {
        boardRow.forEach(function (ignore, c) {
            const here = {col: c, row: r};
            const piece = Game.getPieceAt(state, here);
            if (piece !== null && piece.owner === owner) {
                cells.push(here);
            }
        });
    });
    return cells;
}

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
        const extraLockOns = lockOns.filter(function (lo) {
            return !moves.some(function (m) {
                return m.row === lo.row && m.col === lo.col;
            });
        });
        return moves.concat(extraLockOns);
    }
    return selectableCells(state);
}

function snapCursor(state) {
    const valid = getValidCursorCells(state);
    if (valid.length === 0) {
        return;
    }
    const isValid = valid.some(function (p) {
        return p.row === cursorPos.row && p.col === cursorPos.col;
    });
    if (isValid) {
        return;
    }
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

function isBlockedDirection(p, cur, dr, dc) {
    if (dr < 0 && p.row >= cur.row) {
        return true;
    }
    if (dr > 0 && p.row <= cur.row) {
        return true;
    }
    if (dc < 0 && p.col >= cur.col) {
        return true;
    }
    if (dc > 0 && p.col <= cur.col) {
        return true;
    }
    return false;
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
        if (isBlockedDirection(p, cur, dr, dc)) {
            return;
        }
        const primary = (
            dr !== 0
            ? Math.abs(p.row - cur.row)
            : Math.abs(p.col - cur.col)
        );
        const secondary = (
            dr !== 0
            ? Math.abs(p.col - cur.col)
            : Math.abs(p.row - cur.row)
        );
        const isCloser = (
            primary < bestPrimary
            || (primary === bestPrimary && secondary < bestSecondary)
        );
        if (isCloser) {
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

function renderPiece(cell, piece, row, col, isCooldownHere) {
    const img = document.createElement("img");
    img.src = "resource/p" + piece.owner + "_" + piece.type + ".png";
    img.alt = "";
    cell.appendChild(img);
    cell.classList.add("cell-has-piece");
    cell.classList.add("piece-p" + piece.owner);

    if (rookieMode) {
        const badge = document.createElement("span");
        badge.className = "piece-badge piece-badge-p" + piece.owner;
        badge.textContent = piece.type.charAt(0).toUpperCase();
        badge.setAttribute("aria-hidden", "true");
        cell.appendChild(badge);
    }

    const restingNote = (
        isCooldownHere
        ? " (resting, cannot move this turn)"
        : ""
    );
    cell.setAttribute(
        "aria-label",
        pieceDescription(piece) + restingNote
        + " at row " + (row + 1) + " column " + (col + 1)
    );
}

function applyCellHighlights(cell, row, col, targets) {
    if (isSamePos(selectedCell, {col, row})) {
        cell.classList.add("cell-selected");
    }
    const matches = function (p) {
        return p.row === row && p.col === col;
    };
    if (targets.legal.some(matches)) {
        cell.classList.add("cell-legal");
    }
    if (targets.lockOn.some(matches)) {
        cell.classList.add("cell-lockon");
    }
    if (targets.deploy.some(matches)) {
        cell.classList.add("cell-deploy-target");
    }
    if (targets.cooldownHere) {
        cell.classList.add("cell-cooldown");
    }
    const cursorActive = (
        inputMode === "keyboard"
        && targets.validCursor.length > 0
        && isSamePos(cursorPos, {col, row})
    );
    if (cursorActive) {
        cell.classList.add("cell-cursor");
    }
}

function renderBoard(state) {
    const hasSelection = selectedCell !== null && !Game.canDeploy(state);
    const legalTargets = (
        hasSelection
        ? Game.getLegalMoves(state, selectedCell)
        : []
    );
    const lockOnTargets = (
        hasSelection
        ? Game.getLockOnTargets(state, selectedCell)
        : []
    );
    const deployTargets = (
        Game.canDeploy(state)
        ? Game.getDeployTargets(state)
        : []
    );
    const currentPlayer = Game.getCurrentPlayer(state);
    const cooldownPos = Game.getCooldownBomber(state, currentPlayer);
    const validCursorCells = getValidCursorCells(state);

    document.querySelectorAll(".cell").forEach(function (cell) {
        const row = Number(cell.dataset.row);
        const col = Number(cell.dataset.col);
        const here = {col, row};
        const piece = Game.getPieceAt(state, here);
        const isLight = (row + col) % 2 === 0;

        cell.innerHTML = "";
        cell.className = "cell " + (
            isLight
            ? "cell-light"
            : "cell-dark"
        );

        cell.classList.remove("cell-aa-zone", "cell-aa-p1", "cell-aa-p2");

        const isCooldownHere = isSamePos(cooldownPos, here);
        const zone = Game.getZoneAt(state, here);

        if (zone !== null) {
            cell.classList.add("cell-aa-zone");
            if (zone.owner === 1) {
                cell.classList.add("cell-aa-p1");
            } else {
                cell.classList.add("cell-aa-p2");
            }
        }

        if (piece !== null) {
            renderPiece(cell, piece, row, col, isCooldownHere);
        } else {
            cell.setAttribute(
                "aria-label",
                "Empty square at row " + (row + 1)
                + " column " + (col + 1)
            );
        }

        applyCellHighlights(cell, row, col, {
            legal: legalTargets,
            lockOn: lockOnTargets,
            deploy: deployTargets,
            cooldownHere: isCooldownHere,
            validCursor: validCursorCells
        });
    });
}

function toggleRookieMode() {
    rookieMode = !rookieMode;
    updateRookieToggle();
    renderBoard(gameState);
}

function renderStatus(state) {
    const currentPlayer = Game.getCurrentPlayer(state);

    setText("current-player", playerNames[currentPlayer]);
    setText("mode-indicator", "Mode: " + (
        gameMode === "real"
        ? "Real"
        : "Classic"
    ));
    setClass("current-player", "player2-turn", currentPlayer === 2);
    setClass("status-panel", "player2-turn", currentPlayer === 2);
    setClass("board", "player2-turn", currentPlayer === 2);
    setClass("label-p1", "is-active", currentPlayer === 1);
    setClass("label-p2", "is-active", currentPlayer === 2);

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
 * Render the session ranking board. Sorts players by score descend
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
    const entries = [
        {id: 1, score: sessionScores[1]},
        {id: 2, score: sessionScores[2]}
    ];
    const ranked = entries.sort(function (a, b) {
        return b.score - a.score;
    });

    const tied = ranked[0].score === ranked[1].score;

    ranked.forEach(function (entry, index) {
        const row = document.createElement("div");
        row.className = "rank-row";
        if (!tied && index === 0) {
            row.classList.add("rank-leader");
        }

        const position = document.createElement("span");
        position.className = "rank-position";
        position.textContent = (
            tied
            ? "—"
            : (
                index === 0
                ? "1st"
                : "2nd"
            )
        );

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
        setText("winner-message", playerNames[winner] + " Wins");
        overlay.classList.toggle("player2-wins", winner === 2);
        overlay.removeAttribute("hidden");
    } else {
        overlay.classList.remove("player2-wins");
        overlay.setAttribute("hidden", "");
    }
}

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

function handleArrowKey(event) {
    let dr = 0;
    let dc = 0;
    const key = event.key;
    if (key === "w" || key === "W" || key === "ArrowUp") {
        dr = -1;
    } else if (key === "s" || key === "S" || key === "ArrowDown") {
        dr = 1;
    } else if (key === "a" || key === "A" || key === "ArrowLeft") {
        dc = -1;
    } else if (key === "d" || key === "D" || key === "ArrowRight") {
        dc = 1;
    }

    if (dr === 0 && dc === 0) {
        return false;
    }

    event.preventDefault();
    moveCursor(dr, dc);
    const rowSel = "[data-row=\"" + cursorPos.row + "\"]";
    const colSel = "[data-col=\"" + cursorPos.col + "\"]";
    const target = document.querySelector(".cell" + rowSel + colSel);
    if (target) {
        target.focus({preventScroll: true});
    }
    render(gameState);
    return true;
}

function trySelectPiece(pos) {
    const piece = Game.getPieceAt(gameState, pos);
    const owner = Game.getCurrentPlayer(gameState);
    if (piece !== null && piece.owner === owner) {
        selectedCell = pos;
        render(gameState);
    }
}

function handleNameEntry() {
    const n1 = document.getElementById("name-p1").value.trim();
    const n2 = document.getElementById("name-p2").value.trim();
    playerNames[1] = n1 || "Player 1";
    playerNames[2] = n2 || "Player 2";
    updateStaticNameLabels();
    render(gameState);
    hideNameEntryModal();
    showModeSelectionModal();
}

function getCaptureTarget(previousState, newState) {
    const oldHistory = Game.getMoveHistory(previousState);
    const newHistory = Game.getMoveHistory(newState);
    if (newHistory.length <= oldHistory.length) {
        return null;
    }
    const added = newHistory.slice(oldHistory.length);
    const captures = added.filter(function (entry) {
        return entry.kind === "capture";
    });
    if (captures.length === 0) {
        return null;
    }
    return captures[captures.length - 1].to;
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
    board.dataset.reflow = String(board.offsetWidth);
    board.classList.add("board-shaking");

    setTimeout(function () {
        board.classList.remove("board-shaking");
    }, 500);
}

function playBoomSound() {
    const audio = document.createElement("audio");
    audio.src = "resource/sound.mp3";
    audio.volume = 0.6;
    audio.play().catch(function () {
        return;
    });
}

function applyCaptureEffects(previousState) {
    const capturedAt = getCaptureTarget(previousState, gameState);
    render(gameState);
    if (capturedAt !== null) {
        triggerExplosion(capturedAt);
        playBoomSound();
        shakeBoard();
    }
}

function startTimer() {
    clearInterval(timerInterval);
    timeLeft = TURN_TIME;

    // Snap bar to full instantly
    const fill = document.getElementById("timer-fill");
    if (fill) {
        fill.style.transition = "none";
        fill.style.width = "100%";
        setTimeout(function () {
            fill.style.transition = "";
        }, 0);
    }

    updateTimerDisplay();

    timerInterval = setInterval(function () {
        timeLeft = Math.max(0, timeLeft - 1);
        updateTimerDisplay();
        if (timeLeft === 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            timeoutAction();
        }
    }, 1000);
}

function executeRandomDeploy() {
    const targets = Game.getDeployTargets(gameState);
    if (targets.length > 0 && Math.random() > 0.3) {
        const index = Math.floor(Math.random() * targets.length);
        gameState = Game.deployPlane(gameState, targets[index]);
    } else {
        gameState = Game.skipDeploy(gameState);
    }
    selectedCell = null;
    render(gameState);
    if (!Game.isGameOver(gameState)) {
        startTimer();
    }
}

function executeRandomMove() {
    if (Game.isGameOver(gameState)) {
        return;
    }

    // Deploy phase: pick a random target or skip
    if (Game.canDeploy(gameState)) {
        executeRandomDeploy();
        return;
    }

    // Collect every piece of the current player that has a legal move
    const currentPlayer = Game.getCurrentPlayer(gameState);
    const candidates = collectCandidates(currentPlayer);

    if (candidates.length === 0) {
        startTimer();
        return;
    }

    const pickIndex = Math.floor(Math.random() * candidates.length);
    const pick = candidates[pickIndex];
    const moveIndex = Math.floor(Math.random() * pick.moves.length);
    const move = pick.moves[moveIndex];

    const previousState = gameState;
    gameState = Game.makeMove(gameState, pick.from, move);
    updateScoresFromCaptures(previousState, gameState);

    selectedCell = null;
    applyCaptureEffects(previousState);

    if (Game.isGameOver(gameState)) {
        lastLoser = (
            Game.getWinner(gameState) === 1
            ? 2
            : 1
        );
        stopTimer();
        return;
    }

    startTimer();
}

function recordGameEndOrContinue() {
    if (Game.isGameOver(gameState)) {
        lastLoser = (
            Game.getWinner(gameState) === 1
            ? 2
            : 1
        );
        stopTimer();
    } else {
        startTimer();
    }
}

function tryDeployPhase(pos) {
    const prevDeploy = gameState;
    gameState = Game.deployPlane(gameState, pos);
    if (gameState !== prevDeploy) {
        selectedCell = null;
        render(gameState);
        recordGameEndOrContinue();
    }
}

function tryLockOn(pos) {
    const selPiece = Game.getPieceAt(gameState, selectedCell);
    if (selPiece === null || selPiece.type !== "fighter") {
        return false;
    }
    const lockOns = Game.getLockOnTargets(gameState, selectedCell);
    const isTarget = lockOns.some(function (t) {
        return t.row === pos.row && t.col === pos.col;
    });
    if (!isTarget) {
        return false;
    }
    const previousState = gameState;
    gameState = Game.lockOnAttack(gameState, selectedCell, pos);
    updateScoresFromCaptures(previousState, gameState);
    selectedCell = null;
    applyCaptureEffects(previousState);
    recordGameEndOrContinue();
    return true;
}

function tryRegularMove(pos) {
    const previousState = gameState;
    gameState = Game.makeMove(gameState, selectedCell, pos);

    if (gameState === previousState) {
        const piece = Game.getPieceAt(gameState, pos);
        const owner = Game.getCurrentPlayer(gameState);
        if (piece !== null && piece.owner === owner) {
            selectedCell = pos;
        } else {
            selectedCell = null;
        }
        render(gameState);
        return;
    }

    updateScoresFromCaptures(previousState, gameState);
    selectedCell = null;
    applyCaptureEffects(previousState);
    recordGameEndOrContinue();
}

function activateCell(pos) {
    if (Game.isGameOver(gameState)) {
        return;
    }

    if (Game.canDeploy(gameState)) {
        tryDeployPhase(pos);
        return;
    }

    if (selectedCell === null) {
        trySelectPiece(pos);
        return;
    }

    if (tryLockOn(pos)) {
        return;
    }

    tryRegularMove(pos);
}

function handleCellClick(pos) {
    activateCell(pos);
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
    showModeSelectionModal();
}

function hideRulesModal() {
    document.getElementById("rules-modal").setAttribute("hidden", "");
    if (!Game.isGameOver(gameState)) {
        startTimer();
    }
}

function handleKeyDown(event) {
    if (event.target.tagName === "INPUT") {
        return;
    }

    inputMode = "keyboard";

    const rulesModal = document.getElementById("rules-modal");
    const nameModal = document.getElementById("name-entry-modal");
    const modeModal = document.getElementById("mode-selection-modal");
    const rulesOpen = !rulesModal.hasAttribute("hidden");
    const nameOpen = !nameModal.hasAttribute("hidden");
    const modeOpen = !modeModal.hasAttribute("hidden");

    if (event.key === "Escape") {
        if (rulesOpen) {
            hideRulesModal();
        } else if (modeOpen) {
            hideModeSelectionModal();
        } else if (!nameOpen) {
            selectedCell = null;
            render(gameState);
        }
        return;
    }

    if (rulesOpen || nameOpen || modeOpen) {
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

    if (handleArrowKey(event)) {
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
}

function startNewGame() {
    const initial = Game.createInitialGame();
    const starter = determineNextStarter();
    const fresh = Object.assign({}, initial);
    fresh.currentPlayer = starter;
    gameState = fresh;
    selectedCell = null;
    render(gameState);
    startTimer();
}

function chooseGameMode(mode) {
    gameMode = mode;
    Game.setGameMode(mode);
    updateModeSelectionButtons();
    hideModeSelectionModal();
    startNewGame();
}

function init() {
    const board = document.getElementById("board");

    const indices = Array.from({length: 8}, function (ignore, i) {
        return i;
    });
    indices.forEach(function (r) {
        indices.forEach(function (c) {
            const cell = document.createElement("button");
            cell.type = "button";
            cell.className = "cell";
            cell.dataset.row = String(r);
            cell.dataset.col = String(c);
            cell.addEventListener("click", function () {
                handleCellClick({col: c, row: r});
            });
            board.appendChild(cell);
        });
    });

    bindClick("skip-deploy", handleSkipDeploy);
    bindClick("new-game", handleNewGame);
    bindClick("new-game-overlay", handleNewGame);

    bindClick("show-rules", showRulesModal);
    bindClick("close-rules", hideRulesModal);
    bindClick("toggle-bgm", toggleBGM);
    bindClick("rookie-toggle", toggleRookieMode);
    updateRookieToggle();
    bindClick("confirm-names", handleNameEntry);
    bindClick("mode-classic", function () {
        chooseGameMode("classic");
    });
    bindClick("mode-real", function () {
        chooseGameMode("real");
    });

    const inp1 = document.getElementById("name-p1");
    inp1.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            document.getElementById("name-p2").focus();
        }
    });
    const inp2 = document.getElementById("name-p2");
    inp2.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            handleNameEntry();
        }
    });
    [inp1, inp2].forEach(function (input) {
        input.addEventListener("focus", function () {
            input.classList.remove("confirmed");
        });
        input.addEventListener("blur", function () {
            input.classList.add("confirmed");
        });
    });

    document.addEventListener("mousedown", function () {
        if (inputMode !== "mouse") {
            inputMode = "mouse";
            render(gameState);
        }
    });

    document.addEventListener("keydown", handleKeyDown);

    timeoutAction = executeRandomMove;

    initBGM();
    render(gameState);

    showNameEntryModal();
}

init();