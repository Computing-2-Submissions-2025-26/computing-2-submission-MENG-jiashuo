/**
 * @fileoverview Unit tests for Aircraft Chess — `makeMove`.
 *
 * Tests are organised by category and cover every situation `makeMove`
 * must handle: regular moves, captures, winning the game, boarding,
 * carrying-tanker movement, capturing a loaded tanker, illegal moves,
 * and the purity guarantees that pure functional code must uphold.
 */

import { expect } from "chai";
import * as Game from "../game.js";

/* -----------------------------------------------------------------
 *  TEST CONSTANTS — reused positions to keep tests readable
 * ----------------------------------------------------------------- */
const P1_FIGHTER_START = { row: 0, col: 0 };
const FIGHTER_JUMP_TARGET = { row: 2, col: 1 };
const P1_BOMBER_START = { row: 0, col: 2 };
const P1_TANKER_START = { row: 0, col: 3 };
const P2_FIGHTER_START = { row: 7, col: 0 };
const P2_FIGHTER_TARGET = { row: 5, col: 1 };
const TANKER_DESTINATION = { row: 2, col: 3 };


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
     * ================================================================ */
    describe("when capturing an opposing piece", function () {
        let after;

        beforeEach(function () {
            // Two bombers advance toward each other, then P1 captures.
            let state = Game.createInitialGame();
            state = Game.makeMove(state, P1_BOMBER_START, { row: 1, col: 2 });
            state = Game.makeMove(state, { row: 7, col: 2 }, { row: 6, col: 2 });
            after = Game.makeMove(state, { row: 1, col: 2 }, { row: 6, col: 2 });
        });

        it("removes the opposing piece from the board", function () {
            // The opposing bomber is recorded among Player 2's losses.
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
            // Place a P1 Recon next to P2's Command, then capture it.
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

            expect(Game.getWinner(won), "Player 1 should have won the game").to.equal(1);
            expect(Game.isGameOver(won)).to.equal(true);
        });

        it("sets the status to \"player2Won\" when Player 2 captures Player 1's Command", function () {
            // Place a P2 Recon next to P1's Command, then capture it.
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

            expect(Game.getWinner(won), "Player 2 should have won the game").to.equal(2);
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

            // Player 1 made the winning move; they remain the "current" player
            // (since the game has ended, the turn does not pass).
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

        it("stores the moving piece as the carriedPlane", function () {
            expect(Game.getCarriedPlane(after))
                .to.deep.equal({ type: "bomber", owner: 1 });
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
            // P1 Bomber boards tanker → P2 makes a move → P1 Tanker (loaded) moves
            let state = Game.createInitialGame();
            state = Game.makeMove(state, P1_BOMBER_START, P1_TANKER_START);
            state = Game.makeMove(state, P2_FIGHTER_START, P2_FIGHTER_TARGET);
            after = Game.makeMove(state, P1_TANKER_START, TANKER_DESTINATION);
        });

        it("sets awaitingDeploy to true", function () {
            expect(Game.canDeploy(after), "deploy phase should activate after a loaded tanker moves")
                .to.equal(true);
        });

        it("keeps the currentPlayer unchanged", function () {
            // The tanker belongs to Player 1, and the deploy choice is still theirs.
            expect(Game.getCurrentPlayer(after)).to.equal(1);
        });

        it("preserves the carriedPlane through the move", function () {
            expect(Game.getCarriedPlane(after))
                .to.deep.equal({ type: "bomber", owner: 1 });
        });
    });

    /* ================================================================
     *  F. Capturing a tanker that is carrying a passenger
     * ================================================================ */
    describe("when capturing a loaded tanker", function () {
        let after;

        beforeEach(function () {
            // Build a state directly: P1 Tanker at (4,4) carrying a P1 Bomber;
            // P2 Recon at (5,5) ready to capture diagonally.
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
                            return null;  // remove the original P1 tanker
                        }
                        return cell;
                    }
                )
            );
            const loadedState = {
                ...initial,
                board: customBoard,
                currentPlayer: 2,
                carriedPlane: { type: "bomber", owner: 1 }
            };
            after = Game.makeMove(loadedState, { row: 5, col: 5 }, { row: 4, col: 4 });
        });

        it("records two capture entries — for the tanker and its passenger", function () {
            const captureEntries = Game.getMoveHistory(after)
                .filter((move) => move.kind === "capture");
            expect(captureEntries, "expected two capture entries: tanker + passenger")
                .to.have.lengthOf(2);
        });

        it("clears carriedPlane to null", function () {
            expect(Game.getCarriedPlane(after)).to.equal(null);
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
            // Fighter cannot reach (5, 5) in one L-shaped jump
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
            // Player 1's turn, but trying to move Player 2's Fighter
            const after = Game.makeMove(initial, P2_FIGHTER_START, P2_FIGHTER_TARGET);
            expect(after).to.equal(initial);
        });

        it("returns the state unchanged when called during the deploy phase", function () {
            // Build a state in deploy phase: board the tanker, opponent moves,
            // then move the loaded tanker.
            let state = Game.createInitialGame();
            state = Game.makeMove(state, P1_BOMBER_START, P1_TANKER_START);
            state = Game.makeMove(state, P2_FIGHTER_START, P2_FIGHTER_TARGET);
            state = Game.makeMove(state, P1_TANKER_START, TANKER_DESTINATION);
            expect(Game.canDeploy(state), "setup precondition: should be in deploy phase")
                .to.equal(true);

            const after = Game.makeMove(state, P1_FIGHTER_START, FIGHTER_JUMP_TARGET);
            expect(after).to.equal(state);
        });

        it("returns the state unchanged when called after the game is over", function () {
            // Construct a near-win state by placing a P1 Recon next to P2 Command.
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
            expect(Game.isGameOver(won), "setup precondition: game should be over")
                .to.equal(true);

            const after = Game.makeMove(won, P1_FIGHTER_START, FIGHTER_JUMP_TARGET);
            expect(after).to.equal(won);
        });
    });

    /* ================================================================
     *  H. Purity — the function must not mutate its inputs
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
            // The original array reference should still be empty.
            expect(before.moveHistory).to.equal(historyReference);
            expect(before.moveHistory).to.have.lengthOf(0);
        });
    });
    describe("when the opponent's empty tanker moves while we are carrying", function () {
        it("does not trigger deploy phase for the opponent", function () {
            let state = Game.createInitialGame();
            state = Game.makeMove(state, P1_BOMBER_START, P1_TANKER_START);  // P1 boards
            const after = Game.makeMove(state, { row: 7, col: 3 }, { row: 6, col: 3 });
            // ^ P2 moves their empty tanker

            expect(Game.canDeploy(after),
                "P2's empty tanker should not trigger deploy phase just because P1 is carrying")
                .to.equal(false);
            expect(Game.getCurrentPlayer(after)).to.equal(1);  // turn advanced normally
        });
    });

});