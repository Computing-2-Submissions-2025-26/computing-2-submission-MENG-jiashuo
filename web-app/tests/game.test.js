/**
 * @fileoverview Behaviour-focused unit tests for the Aircraft Chess logic.
 *
 * The suite exercises the public game API with clear scenarios that cover
 * the main rules of the game: movement, captures, boarding, deployment,
 * cooldown handling, lock-on attacks, and state purity.
 */

import { expect } from "chai";
import Game from "../game.js";

const P1_FIGHTER_START = { row: 0, col: 0 };
const FIGHTER_JUMP_TARGET = { row: 2, col: 1 };
const P1_BOMBER_START = { row: 0, col: 2 };
const P1_TANKER_START = { row: 0, col: 3 };
const P2_FIGHTER_START = { row: 7, col: 0 };
const P2_FIGHTER_TARGET = { row: 5, col: 1 };
const TANKER_DESTINATION = { row: 1, col: 3 };

function makeBoard(initial, overrides) {
    return initial.board.map(function (row, r) {
        return row.map(function (cell, c) {
            const key = r + "," + c;
            return Object.prototype.hasOwnProperty.call(overrides, key)
                ? overrides[key]
                : cell;
        });
    });
}

function initialState() {
    return Game.createInitialGame();
}

function buildAAState(overrides) {
    const initial = Game.createInitialGame("classic");
    const board = makeBoard(initial, overrides);
    return {
        ...initial,
        board,
        aaZones: [{
            owner: 2,
            cells: [{ row: 5, col: 1 }]
        }],
        currentPlayer: 1
    };
}

describe("Aircraft Chess rules", function () {
    describe("when a player makes a regular move", function () {
        it("moves the selected piece onto the destination square", function () {
            const state = Game.createInitialGame();
            const after = Game.makeMove(state, P1_FIGHTER_START, FIGHTER_JUMP_TARGET);

            expect(Game.getPieceAt(after, FIGHTER_JUMP_TARGET))
                .to.deep.equal({ type: "fighter", owner: 1 });
        });

        it("leaves the source square empty and passes the turn", function () {
            const state = Game.createInitialGame();
            const after = Game.makeMove(state, P1_FIGHTER_START, FIGHTER_JUMP_TARGET);

            expect(Game.getPieceAt(after, P1_FIGHTER_START)).to.equal(null);
            expect(Game.getCurrentPlayer(after)).to.equal(2);
        });

        it("records the action in history without ending the game", function () {
            const state = Game.createInitialGame();
            const after = Game.makeMove(state, P1_FIGHTER_START, FIGHTER_JUMP_TARGET);
            const history = Game.getMoveHistory(after);

            expect(history).to.have.lengthOf(1);
            expect(history[0].kind).to.equal("move");
            expect(Game.isGameOver(after)).to.equal(false);
        });
    });

    describe("when a player captures an opposing piece", function () {
        let after;

        beforeEach(function () {
            const initial = Game.createInitialGame();
            const board = makeBoard(initial, {
                "4,4": { type: "recon", owner: 1 },
                "5,5": { type: "bomber", owner: 2 }
            });
            const state = { ...initial, board, currentPlayer: 1 };
            after = Game.makeMove(state, { row: 4, col: 4 }, { row: 5, col: 5 });
        });

        it("places the attacker on the captured square", function () {
            expect(Game.getPieceAt(after, { row: 5, col: 5 }))
                .to.deep.equal({ type: "recon", owner: 1 });
        });

        it("adds the captured piece to the opponent's loss list", function () {
            expect(Game.getCapturedPieces(after, 2)).to.deep.equal([
                { type: "bomber", owner: 2 }
            ]);
        });

        it("records the event as a capture in history", function () {
            expect(Game.getMoveHistory(after).at(-1).kind).to.equal("capture");
        });
    });

    describe("when the enemy Command is captured", function () {
        it("ends the game and declares Player 1 the winner", function () {
            const initial = Game.createInitialGame();
            const board = makeBoard(initial, {
                "6,3": { type: "recon", owner: 1 },
                "7,4": { type: "command", owner: 2 }
            });
            const state = { ...initial, board, currentPlayer: 1 };
            const after = Game.makeMove(state, { row: 6, col: 3 }, { row: 7, col: 4 });

            expect(Game.isGameOver(after)).to.equal(true);
            expect(Game.getWinner(after)).to.equal(1);
            expect(Game.getCurrentPlayer(after)).to.equal(1);
        });

        it("ends the game and declares Player 2 the winner", function () {
            const initial = Game.createInitialGame();
            const board = makeBoard(initial, {
                "1,3": { type: "recon", owner: 2 },
                "0,4": { type: "command", owner: 1 }
            });
            const state = { ...initial, board, currentPlayer: 2 };
            const after = Game.makeMove(state, { row: 1, col: 3 }, { row: 0, col: 4 });

            expect(Game.isGameOver(after)).to.equal(true);
            expect(Game.getWinner(after)).to.equal(2);
            expect(Game.getCurrentPlayer(after)).to.equal(2);
        });
    });

    describe("when a piece boards a friendly tanker", function () {
        let after;

        beforeEach(function () {
            const initial = Game.createInitialGame();
            const board = makeBoard(initial, {
                "4,4": { type: "bomber", owner: 1 },
                "4,5": { type: "tanker", owner: 1 }
            });
            const state = { ...initial, board, currentPlayer: 1 };
            after = Game.makeMove(state, { row: 4, col: 4 }, { row: 4, col: 5 });
        });

        it("stores the carried plane as tanker cargo", function () {
            expect(Game.getCarriedPlane(after, 1))
                .to.deep.equal({ type: "bomber", owner: 1 });
        });

        it("leaves the tanker on its original square", function () {
            expect(Game.getPieceAt(after, { row: 4, col: 5 }))
                .to.deep.equal({ type: "tanker", owner: 1 });
        });

        it("records the action as a board event", function () {
            expect(Game.getMoveHistory(after)[0].kind).to.equal("board");
        });
    });

    describe("when a tanker carries a passenger", function () {
        it("enters the deploy phase without changing the carried plane", function () {
            let state = Game.createInitialGame();
            state = Game.makeMove(state, P1_BOMBER_START, P1_TANKER_START);
            state = Game.makeMove(state, P2_FIGHTER_START, P2_FIGHTER_TARGET);
            const after = Game.makeMove(state, P1_TANKER_START, TANKER_DESTINATION);

            expect(Game.canDeploy(after)).to.equal(true);
            expect(Game.getCurrentPlayer(after)).to.equal(1);
            expect(Game.getCarriedPlane(after, 1))
                .to.deep.equal({ type: "bomber", owner: 1 });
        });

        it("offers the adjacent empty squares around the tanker as legal deployment targets", function () {
            let state = Game.createInitialGame();
            state = Game.makeMove(state, P1_BOMBER_START, P1_TANKER_START);
            state = Game.makeMove(state, P2_FIGHTER_START, P2_FIGHTER_TARGET);
            state = Game.makeMove(state, P1_TANKER_START, TANKER_DESTINATION);

            const targets = Game.getDeployTargets(state);
            expect(targets).to.deep.include({ row: 0, col: 3 });
            expect(targets).to.deep.include({ row: 1, col: 2 });
            expect(targets).to.deep.include({ row: 1, col: 4 });
            expect(targets).to.deep.include({ row: 2, col: 3 });
            expect(targets).to.not.deep.include({ row: 3, col: 3 });
        });
    });

    describe("when deployment is pending", function () {
        describe("and a legal target is chosen", function () {
            let after;

            beforeEach(function () {
                let state = Game.createInitialGame();
                state = Game.makeMove(state, P1_BOMBER_START, P1_TANKER_START);
                state = Game.makeMove(state, P2_FIGHTER_START, P2_FIGHTER_TARGET);
                state = Game.makeMove(state, P1_TANKER_START, TANKER_DESTINATION);
                after = Game.deployPlane(state, { row: 0, col: 2 });
            });

            it("places the passenger on the target square", function () {
                expect(Game.getPieceAt(after, { row: 0, col: 2 }))
                    .to.deep.equal({ type: "bomber", owner: 1 });
            });

            it("clears the tanker cargo", function () {
                expect(Game.getCarriedPlane(after, 1)).to.equal(null);
            });

            it("records the action as a deploy event", function () {
                expect(Game.getMoveHistory(after).at(-1).kind).to.equal("deploy");
            });

            it("passes the turn to the other player", function () {
                expect(Game.getCurrentPlayer(after)).to.equal(2);
            });
        });

        it("rejects illegal deployment targets and leaves the state unchanged", function () {
            let state = Game.createInitialGame();
            state = Game.makeMove(state, P1_BOMBER_START, P1_TANKER_START);
            state = Game.makeMove(state, P2_FIGHTER_START, P2_FIGHTER_TARGET);
            state = Game.makeMove(state, P1_TANKER_START, TANKER_DESTINATION);

            const after = Game.deployPlane(state, { row: 5, col: 5 });

            expect(after).to.equal(state);
        });

        it("allows the active player to skip deployment and end the turn", function () {
            let state = Game.createInitialGame();
            state = Game.makeMove(state, P1_BOMBER_START, P1_TANKER_START);
            state = Game.makeMove(state, P2_FIGHTER_START, P2_FIGHTER_TARGET);
            state = Game.makeMove(state, P1_TANKER_START, TANKER_DESTINATION);

            const after = Game.skipDeploy(state);

            expect(Game.canDeploy(after)).to.equal(false);
            expect(Game.getCurrentPlayer(after)).to.equal(2);
        });
    });

    describe("when legal moves are queried", function () {
        it("returns no moves while deployment is pending", function () {
            let state = Game.createInitialGame();
            state = Game.makeMove(state, P1_BOMBER_START, P1_TANKER_START);
            state = Game.makeMove(state, P2_FIGHTER_START, P2_FIGHTER_TARGET);
            state = Game.makeMove(state, P1_TANKER_START, TANKER_DESTINATION);

            expect(Game.getLegalMoves(state, P1_FIGHTER_START)).to.deep.equal([]);
        });

        it("returns no moves for an empty square", function () {
            const state = Game.createInitialGame();
            expect(Game.getLegalMoves(state, { row: 4, col: 4 })).to.deep.equal([]);
        });

        it("returns no moves for an opponent's piece", function () {
            const state = Game.createInitialGame();
            expect(Game.getLegalMoves(state, P2_FIGHTER_START)).to.deep.equal([]);
        });

        it("returns no moves after the game has ended", function () {
            const initial = Game.createInitialGame();
            const over = { ...initial, status: "player1Won" };
            expect(Game.getLegalMoves(over, P1_FIGHTER_START)).to.deep.equal([]);
        });
    });

    describe("when a bomber is on cooldown", function () {
        it("blocks that bomber from moving again until a different piece is played", function () {
            let state = Game.createInitialGame();
            state = Game.makeMove(state, P1_BOMBER_START, { row: 2, col: 2 });
            state = Game.makeMove(state, P2_FIGHTER_START, P2_FIGHTER_TARGET);

            const before = state;
            const after = Game.makeMove(state, { row: 2, col: 2 }, { row: 3, col: 2 });

            expect(after).to.equal(before);
            expect(Game.getLegalMoves(state, { row: 2, col: 2 })).to.deep.equal([]);
        });

        it("exposes the resting bomber position through the public query helper", function () {
            let state = Game.createInitialGame();
            state = Game.makeMove(state, P1_BOMBER_START, { row: 2, col: 2 });

            expect(Game.getCooldownBomber(state, 1)).to.deep.equal({ row: 2, col: 2 });
            expect(Game.getCooldownBomber(state, 2)).to.equal(null);
        });
    });

    describe("when a fighter uses lock-on attack", function () {
        function buildLockOnState() {
            const initial = Game.createInitialGame();
            const board = makeBoard(initial, {
                "4,4": { type: "fighter", owner: 1 },
                "4,5": { type: "bomber", owner: 2 },
                "0,0": null
            });
            return { ...initial, board, currentPlayer: 1 };
        }

        it("destroys the adjacent enemy piece while keeping the fighter in place", function () {
            const state = buildLockOnState();
            const after = Game.lockOnAttack(state, { row: 4, col: 4 }, { row: 4, col: 5 });

            expect(Game.getPieceAt(after, { row: 4, col: 5 })).to.equal(null);
            expect(Game.getPieceAt(after, { row: 4, col: 4 }))
                .to.deep.equal({ type: "fighter", owner: 1 });
        });

        describe("and the attack succeeds", function () {
            let after;

            beforeEach(function () {
                const state = buildLockOnState();
                after = Game.lockOnAttack(state, { row: 4, col: 4 }, { row: 4, col: 5 });
            });

            it("records the destroyed piece in history", function () {
                const history = Game.getMoveHistory(after);
                expect(history).to.have.lengthOf(1);
                expect(history[0].kind).to.equal("capture");
                expect(history[0].captured).to.deep.equal({ type: "bomber", owner: 2 });
            });

            it("passes the turn to the other player", function () {
                expect(Game.getCurrentPlayer(after)).to.equal(2);
            });
        });

        it("ends the game when the attacked piece is the enemy Command", function () {
            const initial = Game.createInitialGame();
            const board = makeBoard(initial, {
                "4,4": { type: "fighter", owner: 1 },
                "4,5": { type: "command", owner: 2 },
                "0,0": null
            });
            const state = { ...initial, board, currentPlayer: 1 };
            const after = Game.lockOnAttack(state, { row: 4, col: 4 }, { row: 4, col: 5 });

            expect(Game.isGameOver(after)).to.equal(true);
            expect(Game.getWinner(after)).to.equal(1);
        });

        it("rejects non-adjacent targets", function () {
            const state = buildLockOnState();
            expect(Game.lockOnAttack(state, { row: 4, col: 4 }, { row: 4, col: 7 })).to.equal(state);
        });

        it("rejects empty target squares", function () {
            const state = buildLockOnState();
            expect(Game.lockOnAttack(state, { row: 4, col: 4 }, { row: 4, col: 3 })).to.equal(state);
        });

        it("rejects friendly targets", function () {
            const state = buildLockOnState();
            const friendlyState = { ...state, board: makeBoard(state, { "4,5": { type: "recon", owner: 1 } }) };
            expect(Game.lockOnAttack(friendlyState, { row: 4, col: 4 }, { row: 4, col: 5 })).to.equal(friendlyState);
        });

        it("reports only adjacent enemy squares through getLockOnTargets", function () {
            const initial = Game.createInitialGame();
            const board = makeBoard(initial, {
                "4,4": { type: "fighter", owner: 1 },
                "3,3": { type: "bomber", owner: 2 },
                "4,5": { type: "recon", owner: 2 },
                "3,4": { type: "recon", owner: 1 },
                "0,0": null
            });
            const state = { ...initial, board, currentPlayer: 1 };
            const targets = Game.getLockOnTargets(state, { row: 4, col: 4 });

            expect(targets).to.deep.include.members([
                { row: 3, col: 3 },
                { row: 4, col: 5 }
            ]);
            expect(targets).to.not.deep.include({ row: 3, col: 4 });
        });

        it("returns no lock-on targets during deployment or for non-fighters", function () {
            let state = Game.createInitialGame();
            state = Game.makeMove(state, P1_BOMBER_START, P1_TANKER_START);
            state = Game.makeMove(state, P2_FIGHTER_START, P2_FIGHTER_TARGET);
            state = Game.makeMove(state, P1_TANKER_START, TANKER_DESTINATION);

            expect(Game.getLockOnTargets(state, { row: 0, col: 7 })).to.deep.equal([]);
            expect(Game.getLockOnTargets(initialState(), { row: 0, col: 2 })).to.deep.equal([]);
        });
    });

    describe("the game state remains pure", function () {
        it("does not mutate the input state or its board when a move is made", function () {
            const before = Game.createInitialGame();
            const snapshot = JSON.parse(JSON.stringify(before));

            Game.makeMove(before, P1_FIGHTER_START, FIGHTER_JUMP_TARGET);

            expect(before).to.deep.equal(snapshot);
            expect(before.board).to.deep.equal(snapshot.board);
            expect(before.moveHistory).to.have.lengthOf(0);
        });
    });

    describe("AA gun zones in real mode", function () {
        it("uses the fixed single-cell zones specified for each player", function () {
            const state = Game.createInitialGame("real");

            expect(state.aaZones).to.deep.equal([
                { owner: 1, cells: [{ row: 2, col: 0 }, { row: 2, col: 2 }, { row: 2, col: 4 }, { row: 2, col: 6 }] },
                { owner: 2, cells: [{ row: 5, col: 1 }, { row: 5, col: 3 }, { row: 5, col: 5 }, { row: 5, col: 7 }] }
            ]);
        });

        describe("when a non-fighter moves into an empty enemy AA zone", function () {
            let after;

            beforeEach(function () {
                const state = buildAAState({
                    "4,0": { type: "tanker", owner: 1 },
                    "5,1": null
                });
                after = Game.makeMove(state, { row: 4, col: 0 }, { row: 5, col: 1 });
            });

            it("clears the source square", function () {
                expect(Game.getPieceAt(after, { row: 4, col: 0 })).to.equal(null);
            });

            it("clears the destination square", function () {
                expect(Game.getPieceAt(after, { row: 5, col: 1 })).to.equal(null);
            });

            it("records the destruction as a single capture event", function () {
                const history = Game.getMoveHistory(after);
                expect(history).to.have.lengthOf(1);
                expect(history[0].kind).to.equal("capture");
            });

            it("attributes the capture to the zone owner", function () {
                const history = Game.getMoveHistory(after);
                expect(history[0].captured).to.deep.equal({ type: "tanker", owner: 1 });
                expect(history[0].capturer).to.equal(2);
            });
        });

        it("lets a fighter move into an empty enemy AA zone unharmed", function () {
            const state = buildAAState({
                "3,0": { type: "fighter", owner: 1 },
                "5,1": null,
                "0,0": null
            });
            const after = Game.makeMove(state, { row: 3, col: 0 }, { row: 5, col: 1 });

            expect(Game.getPieceAt(after, { row: 5, col: 1 }))
                .to.deep.equal({ type: "fighter", owner: 1 });
        });

        it("captures normally when a non-fighter takes a piece on a non-AA cell", function () {
            const state = buildAAState({
                "4,4": { type: "recon", owner: 1 },
                "5,5": { type: "bomber", owner: 2 }
            });
            const after = Game.makeMove(state, { row: 4, col: 4 }, { row: 5, col: 5 });

            expect(Game.getPieceAt(after, { row: 5, col: 5 }))
                .to.deep.equal({ type: "recon", owner: 1 });
            expect(Game.getCapturedPieces(after, 2)).to.deep.equal([
                { type: "bomber", owner: 2 }
            ]);
        });

        describe("when a non-fighter captures inside an enemy AA zone", function () {
            let after;

            beforeEach(function () {
                const state = buildAAState({
                    "4,0": { type: "recon", owner: 1 },
                    "5,1": { type: "bomber", owner: 2 }
                });
                after = Game.makeMove(state, { row: 4, col: 0 }, { row: 5, col: 1 });
            });

            it("removes the attacker from its source square", function () {
                expect(Game.getPieceAt(after, { row: 4, col: 0 })).to.equal(null);
            });

            it("removes the attacker from the destination after the AA hit", function () {
                expect(Game.getPieceAt(after, { row: 5, col: 1 })).to.equal(null);
            });

            it("credits the attacker with the captured defender", function () {
                expect(Game.getCapturedPieces(after, 2)).to.deep.equal([
                    { type: "bomber", owner: 2 }
                ]);
            });

            it("credits the zone owner with the destroyed attacker", function () {
                expect(Game.getCapturedPieces(after, 1)).to.deep.equal([
                    { type: "recon", owner: 1 }
                ]);
            });
        });

        describe("when a fighter captures inside an enemy AA zone", function () {
            let after;

            beforeEach(function () {
                const state = buildAAState({
                    "3,0": { type: "fighter", owner: 1 },
                    "5,1": { type: "bomber", owner: 2 },
                    "0,0": null
                });
                after = Game.makeMove(state, { row: 3, col: 0 }, { row: 5, col: 1 });
            });

            it("keeps the fighter alive on the destination square", function () {
                expect(Game.getPieceAt(after, { row: 5, col: 1 }))
                    .to.deep.equal({ type: "fighter", owner: 1 });
            });

            it("records the defender as captured", function () {
                expect(Game.getCapturedPieces(after, 2)).to.deep.equal([
                    { type: "bomber", owner: 2 }
                ]);
            });

            it("does not record the fighter as a loss", function () {
                expect(Game.getCapturedPieces(after, 1)).to.deep.equal([]);
            });
        });

        describe("when a fighter uses lock-on adjacent to an enemy AA zone", function () {
            let after;

            beforeEach(function () {
                const state = buildAAState({
                    "4,0": { type: "fighter", owner: 1 },
                    "5,1": { type: "bomber", owner: 2 },
                    "0,0": null
                });
                after = Game.lockOnAttack(state, { row: 4, col: 0 }, { row: 5, col: 1 });
            });

            it("removes the target piece", function () {
                expect(Game.getPieceAt(after, { row: 5, col: 1 })).to.equal(null);
            });

            it("keeps the fighter on its original square", function () {
                expect(Game.getPieceAt(after, { row: 4, col: 0 }))
                    .to.deep.equal({ type: "fighter", owner: 1 });
            });

            it("records only the defender as captured", function () {
                expect(Game.getCapturedPieces(after, 2)).to.deep.equal([
                    { type: "bomber", owner: 2 }
                ]);
            });

            it("does not destroy the fighter via AA zone", function () {
                expect(Game.getCapturedPieces(after, 1)).to.deep.equal([]);
            });
        });
    });

    describe("draw detection when both Commanders are lost", function () {
        it("declares P1 winner when P1 Commander captures P2 Commander on a normal cell", function () {
            const initial = Game.createInitialGame("classic");
            const board = makeBoard(initial, {
                "0,4": null,
                "7,4": null,
                "4,3": { type: "command", owner: 1 },
                "5,4": { type: "command", owner: 2 }
            });
            const state = {
                ...initial,
                board,
                aaZones: [],
                currentPlayer: 1
            };
            const after = Game.makeMove(state, { row: 4, col: 3 }, { row: 5, col: 4 });

            expect(Game.isGameOver(after)).to.equal(true);
            expect(Game.isDraw(after)).to.equal(false);
            expect(Game.getWinner(after)).to.equal(1);
        });

        it("declares P1 winner when P1 non-Commander captures P2 Commander on a normal cell", function () {
            const initial = Game.createInitialGame("classic");
            const board = makeBoard(initial, {
                "4,4": { type: "recon", owner: 1 },
                "5,5": { type: "command", owner: 2 }
            });
            const state = {
                ...initial,
                board,
                aaZones: [],
                currentPlayer: 1
            };
            const after = Game.makeMove(state, { row: 4, col: 4 }, { row: 5, col: 5 });

            expect(Game.isGameOver(after)).to.equal(true);
            expect(Game.isDraw(after)).to.equal(false);
            expect(Game.getWinner(after)).to.equal(1);
        });

        describe("when P1 Commander captures P2 Commander inside P2 AA zone", function () {
            let after;

            beforeEach(function () {
                const initial = Game.createInitialGame("classic");
                const board = makeBoard(initial, {
                    "0,4": null,
                    "7,4": null,
                    "4,0": { type: "command", owner: 1 },
                    "5,1": { type: "command", owner: 2 }
                });
                const state = {
                    ...initial,
                    board,
                    aaZones: [{
                        owner: 2,
                        cells: [{ row: 5, col: 1 }]
                    }],
                    currentPlayer: 1
                };
                after = Game.makeMove(state, { row: 4, col: 0 }, { row: 5, col: 1 });
            });

            it("ends the game as a draw", function () {
                expect(Game.isGameOver(after)).to.equal(true);
                expect(Game.isDraw(after)).to.equal(true);
            });

            it("reports no winner", function () {
                expect(Game.getWinner(after)).to.equal(null);
            });

            it("removes both Commanders from the board", function () {
                expect(Game.getPieceAt(after, { row: 5, col: 1 })).to.equal(null);
                expect(Game.getPieceAt(after, { row: 4, col: 0 })).to.equal(null);
            });
        });

        describe("when P1 Commander moves into an empty P2 AA zone", function () {
            let after;

            beforeEach(function () {
                const initial = Game.createInitialGame("classic");
                const board = makeBoard(initial, {
                    "0,4": null,
                    "4,0": { type: "command", owner: 1 },
                    "5,1": null
                });
                const state = {
                    ...initial,
                    board,
                    aaZones: [{
                        owner: 2,
                        cells: [{ row: 5, col: 1 }]
                    }],
                    currentPlayer: 1
                };
                after = Game.makeMove(state, { row: 4, col: 0 }, { row: 5, col: 1 });
            });

            it("ends the game with P2 as winner", function () {
                expect(Game.isGameOver(after)).to.equal(true);
                expect(Game.isDraw(after)).to.equal(false);
                expect(Game.getWinner(after)).to.equal(2);
            });

            it("removes the Commander from the board", function () {
                expect(Game.getPieceAt(after, { row: 5, col: 1 })).to.equal(null);
            });
        });

        describe("when P1 Commander captures a non-Commander inside P2 AA zone", function () {
            let after;

            beforeEach(function () {
                const initial = Game.createInitialGame("classic");
                const board = makeBoard(initial, {
                    "0,4": null,
                    "4,0": { type: "command", owner: 1 },
                    "5,1": { type: "recon", owner: 2 }
                });
                const state = {
                    ...initial,
                    board,
                    aaZones: [{
                        owner: 2,
                        cells: [{ row: 5, col: 1 }]
                    }],
                    currentPlayer: 1
                };
                after = Game.makeMove(state, { row: 4, col: 0 }, { row: 5, col: 1 });
            });

            it("ends the game with P2 as winner", function () {
                expect(Game.isGameOver(after)).to.equal(true);
                expect(Game.isDraw(after)).to.equal(false);
                expect(Game.getWinner(after)).to.equal(2);
            });

            it("removes the Commander from the board", function () {
                expect(Game.getPieceAt(after, { row: 5, col: 1 })).to.equal(null);
            });

            it("still records the defender as captured by the attacker", function () {
                expect(Game.getCapturedPieces(after, 2)).to.deep.equal([
                    { type: "recon", owner: 2 }
                ]);
            });
        });
    });
});
