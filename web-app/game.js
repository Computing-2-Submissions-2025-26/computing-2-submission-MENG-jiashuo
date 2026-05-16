/**
 * @fileoverview Aircraft Chess — game module.
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
 *  - "bomber"  — moves any distance along ranks and files; cannot jump.
 *  - "recon"   — moves any distance diagonally; cannot jump.
 *  - "tanker"  — moves up to two squares in any direction; can carry one
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
 * The complete state of a game in progress.
 *
 * @typedef {Object} GameState
 * @property {Array<Array<Piece|null>>} board          - 8×8 grid. board[row][col]
 *                                                       is the piece on that
 *                                                       square, or null if the
 *                                                       square is empty.
 * @property {Player}                   currentPlayer  - The player whose turn
 *                                                       it is.
 * @property {Piece|null}               carriedPlane   - The piece currently
 *                                                       carried by the tanker,
 *                                                       or null if the tanker
 *                                                       is empty.
 * @property {boolean}                  awaitingDeploy - True when the tanker
 *                                                       has just moved while
 *                                                       carrying a passenger
 *                                                       and the player must
 *                                                       either deploy or skip
 *                                                       before the turn ends.
 * @property {Array<Move>}              moveHistory    - All actions taken so
 *                                                       far, in chronological
 *                                                       order.
 * @property {GameStatus}               status         - Whether the game is
 *                                                       ongoing or has ended.
 */

/* =========================================================================
 *  MODULE CONSTANTS
 * ========================================================================= */

/**
 * The arrangement of aircraft along a player's back rank at the start of
 * the game, reading from column 0 to column 7.
 * @type {Array<PieceType>}
 */
const BACK_ROW = [
    "fighter", "recon", "bomber", "tanker",
    "command", "bomber", "recon", "fighter"
];

/**
 * Maps the final game status to the player who won, or null if the game
 * has not ended.
 */
const STATUS_TO_WINNER = {
    player1Won: 1,
    player2Won: 2,
    playing: null
};

/**
 * Offsets for the Fighter's L-shaped jumps.
 */
const KNIGHT_OFFSETS = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1]
];

/**
 * Orthogonal unit-vector directions (used by Bomber).
 */
const ORTHOGONAL_DIRECTIONS = [
    [-1, 0], [1, 0], [0, -1], [0, 1]
];

/**
 * Diagonal unit-vector directions (used by Recon).
 */
const DIAGONAL_DIRECTIONS = [
    [-1, -1], [-1, 1], [1, -1], [1, 1]
];

/**
 * All eight unit-vector directions around a square (used by Tanker and Command).
 */
const ALL_DIRECTIONS = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1], [0, 1],
    [1, -1], [1, 0], [1, 1]
];

/**
 * Piece types that may board the tanker. Command and Tanker cannot board.
 */
const BOARDABLE_TYPES = ["fighter", "bomber", "recon"];

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
    const emptyRow = () => Array(8).fill(null);
    const playerRow = (player) => BACK_ROW.map(
        (type) => ({ type: type, owner: player })
    );

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
        carriedPlane: null,
        awaitingDeploy: false,
        moveHistory: [],
        status: "playing"
    };
}

/* =========================================================================
 *  INTERNAL HELPERS — not exported
 * ========================================================================= */

/**
 * Test whether a position lies inside the 8×8 board.
 * @private
 */
function isOnBoard(row, col) {
    return row >= 0 && row <= 7 && col >= 0 && col <= 7;
}

/**
 * Decide whether `mover` may step onto the square at (row, col) in a
 * single-square move (used by Fighter and Command, which do not slide).
 * @private
 */
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
    // Friendly piece: only legal if boarding an empty tanker.
    return target.type === "tanker"
        && state.carriedPlane === null
        && BOARDABLE_TYPES.includes(mover.type);
}

/**
 * Walk along a unit direction (dr, dc) from `from`, collecting every
 * square the sliding piece may legally stop on. Stops at the first
 * obstacle that blocks further motion. Recursive — no mutation.
 * @private
 */
function slideInDirection(state, from, mover, dr, dc) {
    function step(row, col, acc) {
        if (!isOnBoard(row, col)) {
            return acc;
        }
        const piece = state.board[row][col];
        if (piece === null) {
            return step(row + dr, col + dc, acc.concat([{ row: row, col: col }]));
        }
        if (piece.owner !== mover.owner) {
            return acc.concat([{ row: row, col: col }]);
        }
        const canBoard = piece.type === "tanker"
            && state.carriedPlane === null
            && BOARDABLE_TYPES.includes(mover.type);
        if (canBoard) {
            return acc.concat([{ row: row, col: col }]);
        }
        return acc;
    }
    return step(from.row + dr, from.col + dc, []);
}

/**
 * Locate the position of `player`'s tanker, or null if it has been captured.
 * @private
 */
function findTanker(state, player) {
    const matches = state.board.flatMap(
        (row, r) => row.map(
            (piece, c) => (
                piece !== null
                && piece.type === "tanker"
                && piece.owner === player
            )
                ? { row: r, col: c }
                : null
        )
    ).filter((cell) => cell !== null);
    return matches.length === 0
        ? null
        : matches[0];
}

/* =========================================================================
 *  PER-PIECE MOVE GENERATORS — internal
 * ========================================================================= */

/** @private */
function fighterMoves(state, from, mover) {
    return KNIGHT_OFFSETS
        .map(([dr, dc]) => ({ row: from.row + dr, col: from.col + dc }))
        .filter((pos) => canStepOnto(state, mover, pos.row, pos.col));
}

/** @private */
function bomberMoves(state, from, mover) {
    return ORTHOGONAL_DIRECTIONS.flatMap(
        ([dr, dc]) => slideInDirection(state, from, mover, dr, dc)
    );
}

/** @private */
function reconMoves(state, from, mover) {
    return DIAGONAL_DIRECTIONS.flatMap(
        ([dr, dc]) => slideInDirection(state, from, mover, dr, dc)
    );
}

/** @private */
function tankerMoves(state, from, mover) {
    return ALL_DIRECTIONS.flatMap(
        ([dr, dc]) => slideInDirection(state, from, mover, dr, dc).slice(0, 2)
    );
}

/** @private */
function commandMoves(state, from, mover) {
    return ALL_DIRECTIONS
        .map(([dr, dc]) => ({ row: from.row + dr, col: from.col + dc }))
        .filter((pos) => canStepOnto(state, mover, pos.row, pos.col));
}

/**
 * Dispatch table from piece type to its move-generator function.
 */
const MOVE_GENERATORS = {
    fighter: fighterMoves,
    bomber: bomberMoves,
    recon: reconMoves,
    tanker: tankerMoves,
    command: commandMoves
};

/* =========================================================================
 *  STATE QUERIES — pure, read-only
 * ========================================================================= */

/**
 * Identify which player is to move.
 *
 * @param   {GameState} state
 * @returns {Player}
 */
function getCurrentPlayer(state) {
    return state.currentPlayer;
}

/**
 * Look up the aircraft on a particular square. Returns null if the position
 * is off the board, so callers may safely query neighbouring squares.
 *
 * @param   {GameState} state
 * @param   {Position}  position
 * @returns {Piece|null} The piece on that square, or null if the square is
 *                       empty or off the board.
 */
function getPieceAt(state, position) {
    const { row, col } = position;
    if (!isOnBoard(row, col)) {
        return null;
    }
    return state.board[row][col];
}

/**
 * Find every square the piece at `fromPosition` is allowed to move to
 * this turn. Returns an empty array if the square is empty, holds an
 * opposing piece, the piece has no legal moves, or the game is in the
 * deploy phase (callers should use getDeployTargets instead).
 *
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
    return MOVE_GENERATORS[piece.type](state, fromPosition, piece);
}

/**
 * Identify the aircraft currently aboard the tanker, if any.
 *
 * @param   {GameState} state
 * @returns {Piece|null} The carried piece, or null if the tanker is empty.
 */
function getCarriedPlane(state) {
    return state.carriedPlane;
}

/**
 * Check whether the current player must choose to deploy or skip before
 * their turn can end. This is true immediately after the tanker has moved
 * while carrying a passenger.
 *
 * @param   {GameState} state
 * @returns {boolean}
 */
function canDeploy(state) {
    return state.awaitingDeploy;
}

/**
 * Find every empty square adjacent to the tanker that the carried piece
 * may be dropped onto this turn. Returns an empty array if the game is
 * not in the deploy phase.
 *
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
    return ALL_DIRECTIONS
        .map(([dr, dc]) => ({
            row: tankerPos.row + dr,
            col: tankerPos.col + dc
        }))
        .filter((pos) => isOnBoard(pos.row, pos.col))
        .filter((pos) => state.board[pos.row][pos.col] === null);
}

/**
 * List every piece belonging to `player` that has been captured so far,
 * in the order they were captured. Useful for displaying a "lost pieces"
 * panel beside the board.
 *
 * @param   {GameState} state
 * @param   {Player}    player
 * @returns {Array<Piece>}
 */
function getCapturedPieces(state, player) {
    return state.moveHistory
        .filter((move) => move.captured !== null
            && move.captured.owner === player)
        .map((move) => move.captured);
}

/**
 * Return the full chronological record of actions taken so far.
 *
 * @param   {GameState} state
 * @returns {Array<Move>}
 */
function getMoveHistory(state) {
    return state.moveHistory.slice();
}

/**
 * Check whether the game has finished.
 *
 * @param   {GameState} state
 * @returns {boolean}
 */
function isGameOver(state) {
    return state.status !== "playing";
}

/**
 * Identify the winning player.
 *
 * @param   {GameState} state
 * @returns {Player|null} The winner, or null if the game is still ongoing.
 */
function getWinner(state) {
    return STATUS_TO_WINNER[state.status];
}

/* =========================================================================
 *  STATE TRANSITIONS — pure, return a new GameState
 * ========================================================================= */

/**
 * Move the piece on `from` to `to`.
 *
 * Resolves whichever of the following situations applies:
 *  - a regular move into an empty square,
 *  - a capture of an opposing piece,
 *  - boarding the friendly tanker (the moving piece becomes carried),
 *  - capturing the tanker (the piece it carries is captured along with it).
 *
 * If the tanker itself moves while carrying a passenger, the resulting
 * state has `awaitingDeploy` set to true and the turn does not yet pass
 * to the opponent. Otherwise the turn advances. If the move is illegal,
 * the state is returned unchanged.
 *
 * @param   {GameState} state
 * @param   {Position}  from
 * @param   {Position}  to
 * @returns {GameState} A new game state reflecting the move.
 */
function makeMove(state, from, to) {
    // TODO: Batch 3
    return state;
}

/**
 * Drop the piece the tanker is carrying onto an empty square adjacent
 * to the tanker. Available only while `canDeploy(state)` is true.
 * Ends the current player's turn.
 *
 * @param   {GameState} state
 * @param   {Position}  deployTo - Empty square adjacent to the tanker.
 * @returns {GameState} A new game state with the carried piece placed
 *                      on `deployTo`, the tanker now empty, and the turn
 *                      passed to the opponent.
 */
function deployPlane(state, deployTo) {
    // TODO: Batch 3
    return state;
}

/**
 * End the current player's turn without deploying. Available only while
 * `canDeploy(state)` is true. The carried piece remains aboard the tanker.
 *
 * @param   {GameState} state
 * @returns {GameState} A new game state with the turn passed to the opponent.
 */
function skipDeploy(state) {
    // TODO: Batch 3
    return state;
}

/* =========================================================================
 *  EXPORTS
 * ========================================================================= */

export {
    createInitialGame,
    getCurrentPlayer,
    getPieceAt,
    getLegalMoves,
    getCarriedPlane,
    canDeploy,
    getDeployTargets,
    getCapturedPieces,
    getMoveHistory,
    isGameOver,
    getWinner,
    makeMove,
    deployPlane,
    skipDeploy
};