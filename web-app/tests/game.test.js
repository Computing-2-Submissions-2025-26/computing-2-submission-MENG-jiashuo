/**
 * @fileoverview Unit tests for Aircraft Chess — `makeMove`.
 *
 * Tests cover every situation `makeMove` must handle: regular moves,
 * captures, winning the game, boarding, carrying-tanker movement,
 * capturing a loaded tanker, illegal moves, the Bomber cooldown rule,
 * and the purity guarantees that pure functional code must uphold.
 */

import { expect } from "chai";
import * as Game from "../game.js";

const P1_FIGHTER_START = { row: 0, col: 0 };
const FIGHTER_JUMP_TARGET = { row: 2, col: 1 };
const P1_BOMBER_START = { row: 0, col: 2 };
const P1_TANKER_START = { row: 0, col: 3 };
const P2_FIGHTER_START = { row: 7, col: 0 };
const P2_FIGHTER_TARGET = { row: 5, col: 1 };
const TANKER_DESTINATION = { row: 1, col: 3 };


describe("makeMove", function () {

    /* ================================================================
     *  A. Regular moves into empty squares
     * ================================================================ */
    describe("for a regular move into an empty square", function () {
        let initial;
        let after;

        beforeEach(function () {
            initial = Game.createInitialGame();
            after = Game.makeMove(initial, P1_FIGHTER_START, FIGHTER_JUMP_TARGET);
        });

        it("moves the piece from its source square to the destination", function () {
            expect(Game.getPieceAt(after, FIGHTER_JUMP_TARGET))
                .to.deep.equal({ type: "fighter", owner: 1 });
        });

        it("clears the source square after the move", function () {
            expect(Game.getPieceAt(after, P1_FIGHTER_START)).to.equal(null);
        });

        it("advances the turn to the opposing player", function () {
            expect(Game.getCurrentPlayer(after)).to.equal(2);
        });

        it("records a \"move\" entry in the move history", function () {
            const history = Game.getMoveHistory(after);
            expect(history).to.have.lengthOf(1);
            expect(history[0].kind).to.equal("move");
        });

        it("does not change the game status", function () {
            expect(Game.isGameOver(after)).to.equal(false);
        });
    });

    /* ================================================================
     *  B. Captures of opposing pieces
     *  Bomber cooldown rule requires an extra non-bomber turn before
     *  the capturing Bomber can act again.
     * ================================================================ */
    describe("when capturing an opposing piece", function () {
        let after;

        beforeEach(function () {
            let state = Game.createInitialGame();
            // Each Bomber advances 2 squares; each side clears its cooldown
            // with a Fighter; P1 Bomber advances 2 more; both sides pass a
            // turn; P1 clears its second cooldown; P2 passes; P1 captures.
            state = Game.makeMove(state, P1_BOMBER_START, { row: 2, col: 2 });
            state = Game.makeMove(state, { row: 7, col: 2 }, { row: 6, col: 2 });
            state = Game.makeMove(state, P1_FIGHTER_START, FIGHTER_JUMP_TARGET);
            state = Game.makeMove(state, { row: 7, col: 7 }, { row: 5, col: 6 });
            state = Game.makeMove(state, { row: 2, col: 2 }, { row: 4, col: 2 });
            state = Game.makeMove(state, { row: 5, col: 6 }, { row: 3, col: 7 });
            state = Game.makeMove(state, FIGHTER_JUMP_TARGET, { row: 4, col: 0 });
            state = Game.makeMove(state, { row: 3, col: 7 }, { row: 5, col: 6 });
            after = Game.makeMove(state, { row: 4, col: 2 }, { row: 6, col: 2 });
        });

        it("removes the opposing piece from the board", function () {
            expect(Game.getCapturedPieces(after, 2))
                .to.deep.equal([{ type: "bomber", owner: 2 }]);
        });

        it("places the moving piece on the target square", function () {
            expect(Game.getPieceAt(after, { row: 6, col: 2 }))
                .to.deep.equal({ type: "bomber", owner: 1 });
        });

        it("records a \"capture\" entry referencing the captured piece", function () {
            const history = Game.getMoveHistory(after);
            const lastEntry = history[history.length - 1];
            expect(lastEntry.kind).to.equal("capture");
            expect(lastEntry.captured).to.deep.equal({ type: "bomber", owner: 2 });
        });

        it("advances the turn to the opposing player", function () {
            expect(Game.getCurrentPlayer(after)).to.equal(2);
        });
    });

    /* ================================================================
     *  C. Capturing the Command ends the game
     * ================================================================ */
    describe("when the Command is captured", function () {

        it("sets the status to \"player1Won\" when Player 1 captures Player 2's Command", function () {
            const initial = Game.createInitialGame();
            const customBoard = initial.board.map(
                (row, r) => row.map(
                    (cell, c) => (
                        r === 6 && c === 3
                            ? { type: "recon", owner: 1 }
                            : cell
                    )
                )
            );
            const nearWin = { ...initial, board: customBoard };
            const won = Game.makeMove(nearWin, { row: 6, col: 3 }, { row: 7, col: 4 });

            expect(Game.getWinner(won), "Player 1 should have won").to.equal(1);
            expect(Game.isGameOver(won)).to.equal(true);
        });

        it("sets the status to \"player2Won\" when Player 2 captures Player 1's Command", function () {
            const initial = Game.createInitialGame();
            const customBoard = initial.board.map(
                (row, r) => row.map(
                    (cell, c) => (
                        r === 1 && c === 3
                            ? { type: "recon", owner: 2 }
                            : cell
                    )
                )
            );
            const nearWin = { ...initial, board: customBoard, currentPlayer: 2 };
            const won = Game.makeMove(nearWin, { row: 1, col: 3 }, { row: 0, col: 4 });

            expect(Game.getWinner(won), "Player 2 should have won").to.equal(2);
            expect(Game.isGameOver(won)).to.equal(true);
        });

        it("keeps the current player unchanged after the winning move", function () {
            const initial = Game.createInitialGame();
            const customBoard = initial.board.map(
                (row, r) => row.map(
                    (cell, c) => (
                        r === 6 && c === 3
                            ? { type: "recon", owner: 1 }
                            : cell
                    )
                )
            );
            const nearWin = { ...initial, board: customBoard };
            const won = Game.makeMove(nearWin, { row: 6, col: 3 }, { row: 7, col: 4 });
            expect(Game.getCurrentPlayer(won)).to.equal(1);
        });
    });

    /* ================================================================
     *  D. Boarding the friendly tanker
     * ================================================================ */
    describe("when boarding the friendly tanker", function () {
        let after;

        beforeEach(function () {
            const initial = Game.createInitialGame();
            after = Game.makeMove(initial, P1_BOMBER_START, P1_TANKER_START);
        });

        it("stores the moving piece as Player 1's carried plane", function () {
            expect(Game.getCarriedPlane(after, 1))
                .to.deep.equal({ type: "bomber", owner: 1 });
        });

        it("leaves Player 2's tanker cargo unaffected", function () {
            expect(Game.getCarriedPlane(after, 2)).to.equal(null);
        });

        it("leaves the tanker on its original square", function () {
            expect(Game.getPieceAt(after, P1_TANKER_START))
                .to.deep.equal({ type: "tanker", owner: 1 });
        });

        it("clears the source square", function () {
            expect(Game.getPieceAt(after, P1_BOMBER_START)).to.equal(null);
        });

        it("records a \"board\" entry in the history", function () {
            const history = Game.getMoveHistory(after);
            expect(history[0].kind).to.equal("board");
        });

        it("does not trigger the deploy phase", function () {
            expect(Game.canDeploy(after)).to.equal(false);
        });
    });

    /* ================================================================
     *  E. Tanker moves while carrying a passenger
     * ================================================================ */
    describe("when the tanker moves while carrying a passenger", function () {
        let after;

        beforeEach(function () {
            let state = Game.createInitialGame();
            state = Game.makeMove(state, P1_BOMBER_START, P1_TANKER_START);
            state = Game.makeMove(state, P2_FIGHTER_START, P2_FIGHTER_TARGET);
            after = Game.makeMove(state, P1_TANKER_START, TANKER_DESTINATION);
        });

        it("sets awaitingDeploy to true", function () {
            expect(Game.canDeploy(after)).to.equal(true);
        });

        it("keeps the currentPlayer unchanged", function () {
            expect(Game.getCurrentPlayer(after)).to.equal(1);
        });

        it("preserves Player 1's carried plane through the move", function () {
            expect(Game.getCarriedPlane(after, 1))
                .to.deep.equal({ type: "bomber", owner: 1 });
        });
    });

    /* ================================================================
     *  E2. Regression: empty opponent tanker must not trigger deploy
     * ================================================================ */
    describe("when an empty tanker moves while the other player is carrying", function () {

        it("does not trigger the deploy phase for the empty tanker's owner", function () {
            let state = Game.createInitialGame();
            state = Game.makeMove(state, P1_BOMBER_START, P1_TANKER_START);
            state = Game.makeMove(state, { row: 7, col: 3 }, { row: 6, col: 3 });

            expect(Game.canDeploy(state)).to.equal(false);
            expect(Game.getCurrentPlayer(state)).to.equal(1);
        });
    });

    /* ================================================================
     *  F. Capturing a tanker that is carrying a passenger
     * ================================================================ */
    describe("when capturing a loaded tanker", function () {
        let after;

        beforeEach(function () {
            const initial = Game.createInitialGame();
            const customBoard = initial.board.map(
                (row, r) => row.map(
                    (cell, c) => {
                        if (r === 4 && c === 4) {
                            return { type: "tanker", owner: 1 };
                        }
                        if (r === 5 && c === 5) {
                            return { type: "recon", owner: 2 };
                        }
                        if (r === 0 && c === 3) {
                            return null;
                        }
                        return cell;
                    }
                )
            );
            const loadedState = {
                ...initial,
                board: customBoard,
                currentPlayer: 2,
                carrying: { 1: { type: "bomber", owner: 1 }, 2: null }
            };
            after = Game.makeMove(loadedState, { row: 5, col: 5 }, { row: 4, col: 4 });
        });

        it("records two capture entries — for the tanker and its passenger", function () {
            const captureEntries = Game.getMoveHistory(after)
                .filter((move) => move.kind === "capture");
            expect(captureEntries).to.have.lengthOf(2);
        });

        it("clears Player 1's carried plane to null", function () {
            expect(Game.getCarriedPlane(after, 1)).to.equal(null);
        });

        it("reports both captures via getCapturedPieces", function () {
            expect(Game.getCapturedPieces(after, 1)).to.deep.equal([
                { type: "tanker", owner: 1 },
                { type: "bomber", owner: 1 }
            ]);
        });
    });

    /* ================================================================
     *  G. Illegal moves leave the state unchanged
     * ================================================================ */
    describe("when called with an illegal move", function () {

        it("returns the state unchanged for a non-legal target", function () {
            const initial = Game.createInitialGame();
            const after = Game.makeMove(initial, P1_FIGHTER_START, { row: 5, col: 5 });
            expect(after).to.equal(initial);
        });

        it("returns the state unchanged when moving from an empty square", function () {
            const initial = Game.createInitialGame();
            const after = Game.makeMove(initial, { row: 4, col: 4 }, { row: 5, col: 5 });
            expect(after).to.equal(initial);
        });

        it("returns the state unchanged when moving an opponent's piece", function () {
            const initial = Game.createInitialGame();
            const after = Game.makeMove(initial, P2_FIGHTER_START, P2_FIGHTER_TARGET);
            expect(after).to.equal(initial);
        });

        it("returns the state unchanged when called during the deploy phase", function () {
            let state = Game.createInitialGame();
            state = Game.makeMove(state, P1_BOMBER_START, P1_TANKER_START);
            state = Game.makeMove(state, P2_FIGHTER_START, P2_FIGHTER_TARGET);
            state = Game.makeMove(state, P1_TANKER_START, TANKER_DESTINATION);
            expect(Game.canDeploy(state)).to.equal(true);

            const after = Game.makeMove(state, P1_FIGHTER_START, FIGHTER_JUMP_TARGET);
            expect(after).to.equal(state);
        });

        it("returns the state unchanged when called after the game is over", function () {
            const initial = Game.createInitialGame();
            const customBoard = initial.board.map(
                (row, r) => row.map(
                    (cell, c) => (
                        r === 6 && c === 3
                            ? { type: "recon", owner: 1 }
                            : cell
                    )
                )
            );
            const nearWin = { ...initial, board: customBoard };
            const won = Game.makeMove(nearWin, { row: 6, col: 3 }, { row: 7, col: 4 });

            const after = Game.makeMove(won, P1_FIGHTER_START, FIGHTER_JUMP_TARGET);
            expect(after).to.equal(won);
        });
    });

    /* ================================================================
     *  H. Purity guarantees
     * ================================================================ */
    describe("purity guarantees", function () {

        it("does not mutate the input state object", function () {
            const before = Game.createInitialGame();
            const snapshot = JSON.parse(JSON.stringify(before));
            Game.makeMove(before, P1_FIGHTER_START, FIGHTER_JUMP_TARGET);
            expect(before).to.deep.equal(snapshot);
        });

        it("does not mutate the input state's board", function () {
            const before = Game.createInitialGame();
            const boardSnapshot = JSON.parse(JSON.stringify(before.board));
            Game.makeMove(before, P1_FIGHTER_START, FIGHTER_JUMP_TARGET);
            expect(before.board).to.deep.equal(boardSnapshot);
        });

        it("does not mutate the input state's moveHistory", function () {
            const before = Game.createInitialGame();
            const historyReference = before.moveHistory;
            Game.makeMove(before, P1_FIGHTER_START, FIGHTER_JUMP_TARGET);
            expect(before.moveHistory).to.equal(historyReference);
            expect(before.moveHistory).to.have.lengthOf(0);
        });
    });

    /* ================================================================
     *  I. Bomber cooldown rule
     *  A Bomber that just moved must rest for one turn before its
     *  owner may move it again.
     * ================================================================ */
    describe("when applying the Bomber cooldown rule", function () {

        it("forbids the same Bomber from moving on the player's next turn", function () {
            let state = Game.createInitialGame();
            state = Game.makeMove(state, P1_BOMBER_START, { row: 2, col: 2 });
            state = Game.makeMove(state, P2_FIGHTER_START, P2_FIGHTER_TARGET);

            const before = state;
            const after = Game.makeMove(state, { row: 2, col: 2 }, { row: 3, col: 2 });
            expect(after, "Bomber on cooldown must be unable to move")
                .to.equal(before);
        });

        it("returns no legal moves for a Bomber on cooldown", function () {
            let state = Game.createInitialGame();
            state = Game.makeMove(state, P1_BOMBER_START, { row: 2, col: 2 });
            state = Game.makeMove(state, P2_FIGHTER_START, P2_FIGHTER_TARGET);

            expect(Game.getLegalMoves(state, { row: 2, col: 2 })).to.deep.equal([]);
        });

        it("clears the cooldown after the player moves a different piece", function () {
            let state = Game.createInitialGame();
            state = Game.makeMove(state, P1_BOMBER_START, { row: 2, col: 2 });
            state = Game.makeMove(state, P2_FIGHTER_START, P2_FIGHTER_TARGET);
            // P1 moves a different piece — this should clear the cooldown
            state = Game.makeMove(state, P1_FIGHTER_START, FIGHTER_JUMP_TARGET);
            state = Game.makeMove(state, { row: 7, col: 7 }, { row: 5, col: 6 });

            const before = state;
            const after = Game.makeMove(state, { row: 2, col: 2 }, { row: 3, col: 2 });
            expect(after, "Bomber should be free to move again after a non-Bomber turn")
                .to.not.equal(before);
        });

        it("exposes the resting Bomber's position via getCooldownBomber", function () {
            let state = Game.createInitialGame();
            state = Game.makeMove(state, P1_BOMBER_START, { row: 2, col: 2 });

            expect(Game.getCooldownBomber(state, 1))
                .to.deep.equal({ row: 2, col: 2 });
            expect(Game.getCooldownBomber(state, 2)).to.equal(null);
        });
    });

    /* ================================================================
     *  J. Recon movement range
     *  Recon slides diagonally up to 2 squares; the 3rd square is out
     *  of range regardless of whether it is occupied.
     * ================================================================ */
    describe("Recon movement range", function () {

        it("can reach the 2nd diagonal square but not the 3rd", function () {
            const initial = Game.createInitialGame();
            const customBoard = initial.board.map(
                (row, r) => row.map(
                    (cell, c) => {
                        if (r === 4 && c === 4) {
                            return { type: "recon", owner: 1 };
                        }
                        if (r === 0 && c === 1) {
                            return null;
                        }
                        return cell;
                    }
                )
            );
            const state = { ...initial, board: customBoard };
            const moves = Game.getLegalMoves(state, { row: 4, col: 4 });

            expect(
                moves.some((p) => p.row === 6 && p.col === 6),
                "2nd diagonal square SE must be reachable"
            ).to.equal(true);

            expect(
                moves.some((p) => p.row === 7 && p.col === 7),
                "3rd diagonal square SE must be out of range"
            ).to.equal(false);
        });
    });

    /* ================================================================
     *  K. Lock-on attack (Fighter ability)
     *  A Fighter may destroy an adjacent enemy in place of its normal
     *  L-jump. It stays on its square; the target is removed.
     * ================================================================ */
    describe("lockOnAttack and getLockOnTargets", function () {

        function makeCustomBoard(initial, overrides) {
            return initial.board.map(
                (row, r) => row.map(
                    (cell, c) => Object.prototype.hasOwnProperty.call(
                        overrides, r + "," + c
                    ) ? overrides[r + "," + c] : cell
                )
            );
        }

        function basicState() {
            const initial = Game.createInitialGame();
            const board = makeCustomBoard(initial, {
                "4,4": { type: "fighter", owner: 1 },
                "0,0": null,
                "4,5": { type: "bomber", owner: 2 }
            });
            return { ...initial, board };
        }

        const FIGHTER_POS = { row: 4, col: 4 };
        const TARGET_POS  = { row: 4, col: 5 };

        describe("lockOnAttack", function () {

            it("removes the targeted enemy from the board", function () {
                const after = Game.lockOnAttack(
                    basicState(), FIGHTER_POS, TARGET_POS
                );
                expect(Game.getPieceAt(after, TARGET_POS)).to.equal(null);
            });

            it("keeps the Fighter on its original square", function () {
                const after = Game.lockOnAttack(
                    basicState(), FIGHTER_POS, TARGET_POS
                );
                expect(Game.getPieceAt(after, FIGHTER_POS))
                    .to.deep.equal({ type: "fighter", owner: 1 });
            });

            it("passes the turn to the opponent", function () {
                const after = Game.lockOnAttack(
                    basicState(), FIGHTER_POS, TARGET_POS
                );
                expect(Game.getCurrentPlayer(after)).to.equal(2);
            });

            it("records a capture entry with correct fields", function () {
                const after = Game.lockOnAttack(
                    basicState(), FIGHTER_POS, TARGET_POS
                );
                const history = Game.getMoveHistory(after);
                expect(history).to.have.lengthOf(1);
                const entry = history[0];
                expect(entry.kind).to.equal("capture");
                expect(entry.from).to.deep.equal(FIGHTER_POS);
                expect(entry.to).to.deep.equal(TARGET_POS);
                expect(entry.piece).to.deep.equal({ type: "fighter", owner: 1 });
                expect(entry.captured).to.deep.equal(
                    { type: "bomber", owner: 2 }
                );
            });

            it("ends the game when the target is the enemy Command", function () {
                const initial = Game.createInitialGame();
                const board = makeCustomBoard(initial, {
                    "4,4": { type: "fighter", owner: 1 },
                    "0,0": null,
                    "4,5": { type: "command", owner: 2 },
                    "7,4": null
                });
                const state = { ...initial, board };
                const after = Game.lockOnAttack(state, FIGHTER_POS, TARGET_POS);
                expect(Game.isGameOver(after)).to.equal(true);
                expect(Game.getWinner(after)).to.equal(1);
                expect(Game.getCurrentPlayer(after)).to.equal(1);
            });

            it("destroys both the Tanker and its passenger", function () {
                const initial = Game.createInitialGame();
                const board = makeCustomBoard(initial, {
                    "4,4": { type: "fighter", owner: 1 },
                    "0,0": null,
                    "4,5": { type: "tanker", owner: 2 },
                    "7,3": null
                });
                const state = {
                    ...initial,
                    board,
                    carrying: { 1: null, 2: { type: "bomber", owner: 2 } }
                };
                const after = Game.lockOnAttack(state, FIGHTER_POS, TARGET_POS);
                const captures = Game.getMoveHistory(after)
                    .filter((m) => m.kind === "capture");
                expect(captures).to.have.lengthOf(2);
                expect(Game.getCarriedPlane(after, 2)).to.equal(null);
            });

            it("returns state unchanged for a non-adjacent target", function () {
                const state = basicState();
                const after = Game.lockOnAttack(
                    state, FIGHTER_POS, { row: 4, col: 7 }
                );
                expect(after).to.equal(state);
            });

            it("returns state unchanged when target square is empty", function () {
                const state = basicState();
                const after = Game.lockOnAttack(
                    state, FIGHTER_POS, { row: 4, col: 3 }
                );
                expect(after).to.equal(state);
            });

            it("returns state unchanged when target is a friendly piece", function () {
                const initial = Game.createInitialGame();
                const board = makeCustomBoard(initial, {
                    "4,4": { type: "fighter", owner: 1 },
                    "0,0": null,
                    "4,5": { type: "recon", owner: 1 },
                    "0,6": null
                });
                const state = { ...initial, board };
                const after = Game.lockOnAttack(state, FIGHTER_POS, TARGET_POS);
                expect(after).to.equal(state);
            });

            it("does not mutate the input state (purity)", function () {
                const state = basicState();
                const snapshot = JSON.parse(JSON.stringify(state));
                Game.lockOnAttack(state, FIGHTER_POS, TARGET_POS);
                expect(state).to.deep.equal(snapshot);
            });
        });

        describe("getLockOnTargets", function () {

            it("returns exactly the adjacent squares with enemy pieces", function () {
                const initial = Game.createInitialGame();
                const board = makeCustomBoard(initial, {
                    "4,4": { type: "fighter", owner: 1 },
                    "0,0": null,
                    "3,3": { type: "bomber", owner: 2 },
                    "4,5": { type: "recon", owner: 2 },
                    "3,4": { type: "recon", owner: 1 },
                    "0,6": null
                });
                const state = { ...initial, board };
                const targets = Game.getLockOnTargets(state, FIGHTER_POS);
                expect(targets.some((p) => p.row === 3 && p.col === 3))
                    .to.equal(true);
                expect(targets.some((p) => p.row === 4 && p.col === 5))
                    .to.equal(true);
                expect(targets.some((p) => p.row === 3 && p.col === 4))
                    .to.equal(false);
            });

            it("returns [] when the piece is not a Fighter", function () {
                const initial = Game.createInitialGame();
                expect(Game.getLockOnTargets(initial, { row: 0, col: 2 }))
                    .to.deep.equal([]);
            });

            it("returns [] during the deploy phase", function () {
                let state = Game.createInitialGame();
                state = Game.makeMove(
                    state, { row: 0, col: 2 }, { row: 0, col: 3 }
                );
                state = Game.makeMove(
                    state, { row: 7, col: 0 }, { row: 5, col: 1 }
                );
                state = Game.makeMove(
                    state, { row: 0, col: 3 }, { row: 1, col: 3 }
                );
                expect(Game.canDeploy(state)).to.equal(true);
                expect(Game.getLockOnTargets(state, { row: 0, col: 7 }))
                    .to.deep.equal([]);
            });
        });
    });

});