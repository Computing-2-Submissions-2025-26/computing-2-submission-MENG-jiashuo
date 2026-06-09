/**
 * @fileoverview Aircraft Chess (logic module)
 *
 * A turn-based, board-based variant of chess played on an 8×8 grid,
 * where every piece is a military aircraft. Two players take alternating
 * turns. The game ends when one player captures the opponent's Command
 * aircraft.
 *
 * This module exposes the game state and the operations that advance
 * or query it. All functions are pure: they never mutate their inputs;
 * state transitions return a new GameState.
 *
 * @module aircraftChess
 */

/* =========================================================================
 *  TYPE DEFINITIONS
 * ========================================================================= */

/**
 * A position on the 8×8 board.
 * Rows and columns are zero-indexed, with (0, 0) at Player 1's left corner.
 *
 * @typedef {Object} Position
 * @property {number} row - Row index, 0 through 7.
 * @property {number} col - Column index, 0 through 7.
 */

/**
 * The kind of aircraft a piece represents.
 *
 *  - "fighter" — moves in an L-shape; the only piece that can jump over others.
 *  - "bomber"  — moves up to two squares along ranks and files; cannot jump;
 *                must rest one turn between consecutive moves.
 *  - "recon"   — moves up to two squares diagonally; cannot jump.
 *  - "tanker"  — moves one square in any direction (surrounding only);
 *                can carry one
 *                friendly piece (other than Command) across the board.
 *  - "command" — moves one square in any direction; capturing the opponent's
 *                Command wins the game.
 *
 * @typedef {("fighter"|"bomber"|"recon"|"tanker"|"command")} PieceType
 */

/**
 * Identifier for one of the two players.
 *
 * @typedef {(1|2)} Player
 */

/**
 * An aircraft on the board.
 *
 * @typedef {Object} Piece
 * @property {PieceType} type  - The kind of aircraft.
 * @property {Player}    owner - The player who controls this piece.
 */

/**
 * A single recorded action taken during the game.
 *
 *  - "move"    — a piece moved to an empty square.
 *  - "capture" — a piece moved onto and captured an opposing piece.
 *  - "board"   — a friendly piece moved onto the tanker and was loaded aboard.
 *  - "deploy"  — the tanker dropped its passenger on an adjacent empty square.
 *
 * @typedef {Object} Move
 * @property {("move"|"capture"|"board"|"deploy")} kind     - What kind of
 *                                                            action this was.
 * @property {Position}    from     - Source square of the action.
 * @property {Position}    to       - Target square of the action.
 * @property {Piece}       piece    - The piece that performed the action.
 * @property {Piece|null}  captured - The opposing piece removed by this
 *                                    action, if any.
 */

/**
 * The status of the game.
 *  - "playing"    — the game is in progress.
 *  - "player1Won" — Player 1 has captured Player 2's Command.
 *  - "player2Won" — Player 2 has captured Player 1's Command.
 *
 * @typedef {("playing"|"player1Won"|"player2Won")} GameStatus
 */

/**
 * Per-player record of each tanker's current cargo. Keyed by player id
 * (1 or 2). The value is the piece being carried, or null if that
 * player's tanker is empty (or has been captured).
 *
 * @typedef {Object} CarryingMap
 */

/**
 * Per-player record of where each player's most recently moved Bomber
 * landed. A Bomber at this position is on cooldown — its owner must
 * move a different piece on their next turn before they may move this
 * Bomber again. null means no Bomber is on cooldown.
 *
 * @typedef {Object} CooldownMap
 */

/**
 * The complete state of a game in progress.
 *
 * @typedef {Object} GameState
 * @property {Array<Array<Piece|null>>} board             - 8×8 grid.
 * @property {Player}                   currentPlayer     - The player whose
 *                                                          turn it is.
 * @property {CarryingMap}              carrying          - Per-player tanker
 *                                                          cargo.
 * @property {CooldownMap}              lastMovedBombers  - Per-player Bomber
 *                                                          cooldown markers.
 * @property {boolean}                  awaitingDeploy    - True when the
 *                                                          tanker has just
 *                                                          moved while
 *                                                          carrying.
 * @property {Array<Move>}              moveHistory       - Chronological list
 *                                                          of actions.
 * @property {GameStatus}               status            - Game over status.
 */

/* =========================================================================
 *  MODULE CONSTANTS
 * ========================================================================= */

const BACK_ROW = [
    "fighter", "recon", "bomber", "tanker",
    "command", "bomber", "recon", "fighter"
];

const STATUS_TO_WINNER = {
    player1Won: 1,
    player2Won: 2,
    playing: null
};

const KNIGHT_OFFSETS = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1]
];

const ORTHOGONAL_DIRECTIONS = [
    [-1, 0], [1, 0], [0, -1], [0, 1]
];

const DIAGONAL_DIRECTIONS = [
    [-1, -1], [-1, 1], [1, -1], [1, 1]
];

const ALL_DIRECTIONS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1]
];

const BOARDABLE_TYPES = ["fighter", "bomber", "recon"];

const BOMBER_RANGE = 2;
const RECON_RANGE = 2;
const TANKER_RANGE = 1;

/* =========================================================================
 *  STATE CREATION
 * ========================================================================= */

/**
 * Create a new game with all aircraft in their starting positions
 * and Player 1 to move first.
 *
 * @returns {GameState} A fresh game state ready to play.
 */
function createInitialGame() {
    function emptyRow() {
        return new Array(8).fill(null);
    }
    function playerRow(player) {
        return BACK_ROW.map(function (type) {
            return {type: type, owner: player};
        });
    }

    const board = [
        playerRow(1),
        emptyRow(),
        emptyRow(),
        emptyRow(),
        emptyRow(),
        emptyRow(),
        emptyRow(),
        playerRow(2)
    ];

    return {
        board: board,
        currentPlayer: 1,
        carrying: {"1": null, "2": null},
        lastMovedBombers: {"1": null, "2": null},
        awaitingDeploy: false,
        moveHistory: [],
        status: "playing"
    };
}

/* =========================================================================
 *  INTERNAL HELPERS
 * ========================================================================= */

/** @private */
function isOnBoard(row, col) {
    return row >= 0 && row <= 7 && col >= 0 && col <= 7;
}

/** @private */
function otherPlayer(player) {
    return (
        player === 1
        ? 2
        : 1
    );
}

/** @private */
function setPiece(board, position, piece) {
    return board.map(function (row, r) {
        if (r !== position.row) {
            return row;
        }
        return row.map(function (cell, c) {
            return (
                c === position.col
                ? piece
                : cell
            );
        });
    });
}

/** @private */
function nextCooldownAfterMove(state, mover, to) {
    const result = Object.assign({}, state.lastMovedBombers);
    result[mover.owner] = (
        mover.type === "bomber"
        ? to
        : null
    );
    return result;
}

/** @private */
function isBomberOnCooldown(state, piece, pos) {
    if (piece.type !== "bomber") {
        return false;
    }
    const locked = state.lastMovedBombers[piece.owner];
    return locked !== null && locked.row === pos.row && locked.col === pos.col;
}

/** @private */
function canStepOnto(state, mover, row, col) {
    if (!isOnBoard(row, col)) {
        return false;
    }
    const target = state.board[row][col];
    if (target === null) {
        return true;
    }
    if (target.owner !== mover.owner) {
        return true;
    }
    return (
        target.type === "tanker"
        && state.carrying[mover.owner] === null
        && BOARDABLE_TYPES.includes(mover.type)
    );
}

/** @private */
function slideInDirection(state, from, mover, dr, dc) {
    function step(row, col, acc) {
        if (!isOnBoard(row, col)) {
            return acc;
        }
        const piece = state.board[row][col];
        if (piece === null) {
            return step(
                row + dr,
                col + dc,
                acc.concat([{row: row, col: col}])
            );
        }
        if (piece.owner !== mover.owner) {
            return acc.concat([{row: row, col: col}]);
        }
        const canBoard = (
            piece.type === "tanker"
            && state.carrying[mover.owner] === null
            && BOARDABLE_TYPES.includes(mover.type)
        );
        if (canBoard) {
            return acc.concat([{row: row, col: col}]);
        }
        return acc;
    }
    return step(from.row + dr, from.col + dc, []);
}

/** @private */
function findTanker(state, player) {
    const matches = state.board.flatMap(function (row, r) {
        return row.map(function (piece, c) {
            const isTarget = (
                piece !== null
                && piece.type === "tanker"
                && piece.owner === player
            );
            return (
                isTarget
                ? {row: r, col: c}
                : null
            );
        });
    }).filter(function (cell) {
        return cell !== null;
    });
    return (
        matches.length === 0
        ? null
        : matches[0]
    );
}

/* =========================================================================
 *  PER-PIECE MOVE GENERATORS
 * ========================================================================= */

/** @private */
function fighterMoves(state, from, mover) {
    return KNIGHT_OFFSETS.map(function ([dr, dc]) {
        return {row: from.row + dr, col: from.col + dc};
    }).filter(function (pos) {
        return canStepOnto(state, mover, pos.row, pos.col);
    });
}

/** @private */
function bomberMoves(state, from, mover) {
    return ORTHOGONAL_DIRECTIONS.flatMap(function ([dr, dc]) {
        const line = slideInDirection(state, from, mover, dr, dc);
        return line.slice(0, BOMBER_RANGE);
    });
}

/** @private */
function reconMoves(state, from, mover) {
    return DIAGONAL_DIRECTIONS.flatMap(function ([dr, dc]) {
        const line = slideInDirection(state, from, mover, dr, dc);
        return line.slice(0, RECON_RANGE);
    });
}

/** @private */
function tankerMoves(state, from, mover) {
    return ALL_DIRECTIONS.flatMap(function ([dr, dc]) {
        const line = slideInDirection(state, from, mover, dr, dc);
        return line.slice(0, TANKER_RANGE);
    });
}

/** @private */
function commandMoves(state, from, mover) {
    return ALL_DIRECTIONS.map(function ([dr, dc]) {
        return {row: from.row + dr, col: from.col + dc};
    }).filter(function (pos) {
        return canStepOnto(state, mover, pos.row, pos.col);
    });
}
const MOVE_GENERATORS = {
    fighter: fighterMoves,
    bomber: bomberMoves,
    recon: reconMoves,
    tanker: tankerMoves,
    command: commandMoves
};

/* =========================================================================
 *  STATE TRANSITION HANDLERS
 * ========================================================================= */

/** @private */
function applyRegularMove(state, from, to, mover) {
    const newBoard = setPiece(setPiece(state.board, from, null), to, mover);
    const record = {
        kind: "move",
        from: from,
        to: to,
        piece: mover,
        captured: null
    };
    const triggersDeploy = (
        mover.type === "tanker"
        && state.carrying[mover.owner] !== null
    );
    const result = Object.assign({}, state);
    result.board = newBoard;
    result.moveHistory = state.moveHistory.concat([record]);
    result.currentPlayer = (
        triggersDeploy
        ? state.currentPlayer
        : otherPlayer(state.currentPlayer)
    );
    result.awaitingDeploy = triggersDeploy;
    result.lastMovedBombers = nextCooldownAfterMove(state, mover, to);
    return result;
}

/** @private */
function applyCapture(state, from, to, mover, target) {
    const newBoard = setPiece(setPiece(state.board, from, null), to, mover);
    const mainRecord = {
        kind: "capture",
        from: from,
        to: to,
        piece: mover,
        captured: target
    };

    const moverIsCarrying = (
        mover.type === "tanker"
        && state.carrying[mover.owner] !== null
    );
    const passengerLost = (
        target.type === "tanker"
        && state.carrying[target.owner] !== null
    );
    const lostPassenger = (
        passengerLost
        ? state.carrying[target.owner]
        : null
    );
    const extraRecords = (
        passengerLost
        ? [{
            kind: "capture",
            from: to,
            to: to,
            piece: mover,
            captured: lostPassenger
        }]
        : []
    );

    const gameEnded = target.type === "command";
    const winStatus = (
        mover.owner === 1
        ? "player1Won"
        : "player2Won"
    );
    const newStatus = (
        gameEnded
        ? winStatus
        : state.status
    );

    const triggersDeploy = moverIsCarrying && !gameEnded;

    const carryingWithDrop = Object.assign({}, state.carrying);
    carryingWithDrop[target.owner] = null;
    const newCarrying = (
        passengerLost
        ? carryingWithDrop
        : state.carrying
    );
    const result = Object.assign({}, state);
    result.board = newBoard;
    result.moveHistory = (
        state.moveHistory.concat([mainRecord]).concat(extraRecords)
    );
    result.currentPlayer = (
        (gameEnded || triggersDeploy)
        ? state.currentPlayer
        : otherPlayer(state.currentPlayer)
    );
    result.carrying = newCarrying;
    result.awaitingDeploy = triggersDeploy;
    result.status = newStatus;
    result.lastMovedBombers = nextCooldownAfterMove(state, mover, to);
    return result;
}

/** @private */
function applyBoard(state, from, to, mover) {
    const newBoard = setPiece(state.board, from, null);
    const record = {
        kind: "board",
        from: from,
        to: to,
        piece: mover,
        captured: null
    };

    const newCarrying = Object.assign({}, state.carrying);
    newCarrying[mover.owner] = mover;
    const newCooldown = Object.assign({}, state.lastMovedBombers);
    newCooldown[mover.owner] = null;
    const result = Object.assign({}, state);
    result.board = newBoard;
    result.carrying = newCarrying;
    result.moveHistory = state.moveHistory.concat([record]);
    result.currentPlayer = otherPlayer(state.currentPlayer);
    result.awaitingDeploy = false;
    result.lastMovedBombers = newCooldown;
    return result;
}

/* =========================================================================
 *  STATE QUERIES
 * ========================================================================= */

/**
 * Identify which player is to move.
 * @param   {GameState} state
 * @returns {Player}
 */
function getCurrentPlayer(state) {
    return state.currentPlayer;
}

/**
 * Look up the aircraft on a particular square. Returns null if the position
 * is off the board.
 * @param   {GameState} state
 * @param   {Position}  position
 * @returns {Piece|null}
 */
function getPieceAt(state, position) {
    const {row, col} = position;
    if (!isOnBoard(row, col)) {
        return null;
    }
    return state.board[row][col];
}

/**
 * Find every square the piece at `fromPosition` may legally move to.
 * @param   {GameState} state
 * @param   {Position}  fromPosition
 * @returns {Array<Position>}
 */
function getLegalMoves(state, fromPosition) {
    if (state.awaitingDeploy) {
        return [];
    }
    if (state.status !== "playing") {
        return [];
    }
    const piece = getPieceAt(state, fromPosition);
    if (piece === null) {
        return [];
    }
    if (piece.owner !== state.currentPlayer) {
        return [];
    }
    if (isBomberOnCooldown(state, piece, fromPosition)) {
        return [];
    }
    return MOVE_GENERATORS[piece.type](state, fromPosition, piece);
}

/**
 * Identify the aircraft currently aboard `player`'s tanker, if any.
 * @param   {GameState} state
 * @param   {Player}    player
 * @returns {Piece|null}
 */
function getCarriedPlane(state, player) {
    return state.carrying[player];
}

/**
 * Identify the position of `player`'s Bomber that is currently resting,
 * or null if no Bomber of that player is resting.
 * @param   {GameState} state
 * @param   {Player}    player
 * @returns {Position|null}
 */
function getCooldownBomber(state, player) {
    const pos = state.lastMovedBombers[player];
    if (pos === null) {
        return null;
    }
    const piece = state.board[pos.row][pos.col];
    if (piece === null || piece.type !== "bomber" || piece.owner !== player) {
        return null;
    }
    return pos;
}

/**
 * Check whether the current player must choose to deploy or skip.
 * @param   {GameState} state
 * @returns {boolean}
 */
function canDeploy(state) {
    return state.awaitingDeploy;
}

/**
 * Find every empty square adjacent to the current player's tanker.
 * @param   {GameState} state
 * @returns {Array<Position>}
 */
function getDeployTargets(state) {
    if (!state.awaitingDeploy) {
        return [];
    }
    const tankerPos = findTanker(state, state.currentPlayer);
    if (tankerPos === null) {
        return [];
    }
    return ALL_DIRECTIONS.map(function ([dr, dc]) {
        return {
            row: tankerPos.row + dr,
            col: tankerPos.col + dc
        };
    }).filter(function (pos) {
        return isOnBoard(pos.row, pos.col);
    }).filter(function (pos) {
        return state.board[pos.row][pos.col] === null;
    });
}

/**
 * List every piece belonging to `player` that has been captured so far.
 * @param   {GameState} state
 * @param   {Player}    player
 * @returns {Array<Piece>}
 */
function getCapturedPieces(state, player) {
    return state.moveHistory.filter(function (move) {
        return move.captured !== null && move.captured.owner === player;
    }).map(function (move) {
        return move.captured;
    });
}

/**
 * Return the full chronological record of actions taken so far.
 * @param   {GameState} state
 * @returns {Array<Move>}
 */
function getMoveHistory(state) {
    return state.moveHistory.slice();
}

/**
 * Check whether the game has finished.
 * @param   {GameState} state
 * @returns {boolean}
 */
function isGameOver(state) {
    return state.status !== "playing";
}

/**
 * Identify the winning player.
 * @param   {GameState} state
 * @returns {Player|null}
 */
function getWinner(state) {
    return STATUS_TO_WINNER[state.status];
}

/* =========================================================================
 *  STATE TRANSITIONS
 * ========================================================================= */

/**
 * Move the piece on `from` to `to`. Returns the unchanged state if the
 * move is illegal.
 * @param   {GameState} state
 * @param   {Position}  from
 * @param   {Position}  to
 * @returns {GameState}
 */
function makeMove(state, from, to) {
    const isLegal = getLegalMoves(state, from).some(function (pos) {
        return pos.row === to.row && pos.col === to.col;
    });
    if (!isLegal) {
        return state;
    }

    const mover = state.board[from.row][from.col];
    const target = state.board[to.row][to.col];

    if (target !== null && target.owner === mover.owner) {
        return applyBoard(state, from, to, mover);
    }
    if (target !== null) {
        return applyCapture(state, from, to, mover, target);
    }
    return applyRegularMove(state, from, to, mover);
}

/**
 * Drop the carried piece onto an empty square adjacent to the tanker.
 * @param   {GameState} state
 * @param   {Position}  deployTo
 * @returns {GameState}
 */
function deployPlane(state, deployTo) {
    if (!state.awaitingDeploy) {
        return state;
    }
    const isValid = getDeployTargets(state).some(function (pos) {
        return pos.row === deployTo.row && pos.col === deployTo.col;
    });
    if (!isValid) {
        return state;
    }

    const tankerPos = findTanker(state, state.currentPlayer);
    const passenger = state.carrying[state.currentPlayer];
    const newBoard = setPiece(state.board, deployTo, passenger);
    const record = {
        kind: "deploy",
        from: tankerPos,
        to: deployTo,
        piece: passenger,
        captured: null
    };

    const newCarrying = Object.assign({}, state.carrying);
    newCarrying[state.currentPlayer] = null;
    const result = Object.assign({}, state);
    result.board = newBoard;
    result.carrying = newCarrying;
    result.moveHistory = state.moveHistory.concat([record]);
    result.currentPlayer = otherPlayer(state.currentPlayer);
    result.awaitingDeploy = false;
    return result;
}

/**
 * End the current player's turn without deploying.
 * @param   {GameState} state
 * @returns {GameState}
 */
function skipDeploy(state) {
    if (!state.awaitingDeploy) {
        return state;
    }
    const result = Object.assign({}, state);
    result.currentPlayer = otherPlayer(state.currentPlayer);
    result.awaitingDeploy = false;
    return result;
}
/* =========================================================================
 *  LOCK-ON ATTACK
 * ========================================================================= */

/**
 * Find every adjacent square that holds an enemy piece the current
 * player's Fighter at `fighterPosition` may lock on to and destroy.
 * @param   {GameState} state
 * @param   {Position}  fighterPosition
 * @returns {Array<Position>}
 */
function getLockOnTargets(state, fighterPosition) {
    if (state.awaitingDeploy) {
        return [];
    }
    if (state.status !== "playing") {
        return [];
    }
    const fighter = getPieceAt(state, fighterPosition);
    if (fighter === null) {
        return [];
    }
    if (fighter.type !== "fighter") {
        return [];
    }
    if (fighter.owner !== state.currentPlayer) {
        return [];
    }
    return ALL_DIRECTIONS.map(function ([dr, dc]) {
        return {
            row: fighterPosition.row + dr,
            col: fighterPosition.col + dc
        };
    }).filter(function (pos) {
        return isOnBoard(pos.row, pos.col);
    }).filter(function (pos) {
        const target = state.board[pos.row][pos.col];
        return target !== null && target.owner !== fighter.owner;
    });
}

/**
 * Destroy the enemy piece at `targetPosition`,
 * the Fighter stays in place; the target is removed.
 * Returns the unchanged state if the action is illegal.
 * @param   {GameState} state
 * @param   {Position}  fighterPosition
 * @param   {Position}  targetPosition
 * @returns {GameState}
 */
function lockOnAttack(state, fighterPosition, targetPosition) {
    if (state.awaitingDeploy) {
        return state;
    }
    if (state.status !== "playing") {
        return state;
    }
    const fighter = getPieceAt(state, fighterPosition);
    if (fighter === null) {
        return state;
    }
    if (fighter.type !== "fighter") {
        return state;
    }
    if (fighter.owner !== state.currentPlayer) {
        return state;
    }

    const dr = targetPosition.row - fighterPosition.row;
    const dc = targetPosition.col - fighterPosition.col;
    if (!isOnBoard(targetPosition.row, targetPosition.col)) {
        return state;
    }
    if (Math.abs(dr) > 1) {
        return state;
    }
    if (Math.abs(dc) > 1) {
        return state;
    }
    if (dr === 0 && dc === 0) {
        return state;
    }
    const target = getPieceAt(state, targetPosition);
    if (target === null || target.owner === fighter.owner) {
        return state;
    }

    const mainRecord = {
        kind: "capture",
        from: fighterPosition,
        to: targetPosition,
        piece: fighter,
        captured: target
    };
    const passengerLost = (
        target.type === "tanker"
        && state.carrying[target.owner] !== null
    );
    const lostPassenger = (
        passengerLost
        ? state.carrying[target.owner]
        : null
    );
    const extraRecords = (
        passengerLost
        ? [{
            kind: "capture",
            from: targetPosition,
            to: targetPosition,
            piece: fighter,
            captured: lostPassenger
        }]
        : []
    );

    const carryingWithDrop = Object.assign({}, state.carrying);
    carryingWithDrop[target.owner] = null;
    const newCarrying = (
        passengerLost
        ? carryingWithDrop
        : state.carrying
    );

    const newBoard = setPiece(state.board, targetPosition, null);
    const gameEnded = target.type === "command";
    const winStatus = (
        fighter.owner === 1
        ? "player1Won"
        : "player2Won"
    );
    const newStatus = (
        gameEnded
        ? winStatus
        : state.status
    );

    const newCooldown = Object.assign({}, state.lastMovedBombers);
    newCooldown[fighter.owner] = null;
    const result = Object.assign({}, state);
    result.board = newBoard;
    const withMain = state.moveHistory.concat([mainRecord]);
    result.moveHistory = withMain.concat(extraRecords);
    result.currentPlayer = (
        gameEnded
        ? state.currentPlayer
        : otherPlayer(state.currentPlayer)
    );
    result.carrying = newCarrying;
    result.status = newStatus;
    result.lastMovedBombers = newCooldown;
    return result;
}

/* =========================================================================
 *  EXPORTS
 * ========================================================================= */
const Game = {
    createInitialGame: createInitialGame,
    getCurrentPlayer: getCurrentPlayer,
    getPieceAt: getPieceAt,
    getLegalMoves: getLegalMoves,
    getCarriedPlane: getCarriedPlane,
    getCooldownBomber: getCooldownBomber,
    canDeploy: canDeploy,
    getDeployTargets: getDeployTargets,
    getCapturedPieces: getCapturedPieces,
    getMoveHistory: getMoveHistory,
    isGameOver: isGameOver,
    getWinner: getWinner,
    makeMove: makeMove,
    deployPlane: deployPlane,
    skipDeploy: skipDeploy,
    getLockOnTargets: getLockOnTargets,
    lockOnAttack: lockOnAttack
};

export default Object.freeze(Game);