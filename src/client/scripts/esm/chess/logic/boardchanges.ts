
/**
 * This script both contructs the changes list of a Move, and executes them
 * when requested, modifying the piece lists according to what moved
 * or was captured, forward or backward.
 * 
 * The change functions here do NOT modify the mesh or animate anything,
 * however, graphicalchanges.ts may rely on these changes present to
 * know how to change the mesh, or what to animate.
 */

// @ts-ignore
import organizedlines from "./organizedlines.js";
// @ts-ignore
import gamefileutility from "../util/gamefileutility.js";
// @ts-ignore
import jsutil from "../../util/jsutil.js";


// Variables -------------------------------------------------------------------------


/** All Change actions that cannot be undone to return to the same board position later in the game, unless in the future it's possible to add pieces mid-game. */
const oneWayActions: string[] = ['capture', 'delete'];


// Type Definitions-------------------------------------------------------------------------


// @ts-ignore
import type { gamefile } from "./gamefile.js";
// @ts-ignore
import type { Move } from "./movepiece.js";
import type { Coords } from "./movesets.js";

interface Piece {
	type: string // - The type of the piece (e.g. `queensW`).
	coords: Coords // - The coordinates of the piece: `[x,y]`
	index: number // - The index of the piece within the gamefile's piece list.
}

/**
 * Generic type to describe any changes to the board
 */
type Change = {
	/** Whether this change affects the main piece moved.
	 * This would be true if the change was for moving the king during castling, but false for moving the rook. */
	main: boolean,
	/** The main piece affected by the move. If this is a move/capture action, it's the piece moved. If it's an add/delete action, it's the piece added/deleted. */
	piece: Piece
} & ({
	/** The type of action this change performs. */
	action: 'add' | 'delete',
	// No additional properties needed
} | {
	action: 'capture',
	endCoords: Coords,
	capturedPiece: Piece,
	/** A custom path the moving piece took to make the capture. (e.g. Rose piece) */
	path?: Coords[],
} | {
	action: 'move',
	endCoords: Coords,
	path?: Coords[],
})

/**
 * A generic function that takes the changes list of a move, and modifies either
 * the piece lists to reflect that move, or modifies the mesh of the pieces,
 * depending on the function, BUT NOT BOTH.
 */
// eslint-disable-next-line no-unused-vars
type genericChangeFunc = (gamefile: gamefile, change: Change) => void;

/**
 * An actionlist is a dictionary links actions to functions.
 * The function uses the change data for operations. Eg animation, updating mesh, logic 
 * It won't always include every action.
 * If an action is looked up and there isn't a function for it, it's change is ignored
 */
interface ActionList<F extends CallableFunction> {
	[actionName: string]: F
}

/** 
 * A change application is used for applying the changelist of a move in both directions.
 */
interface ChangeApplication<F extends CallableFunction> {
	forward: ActionList<F>,
	backward: ActionList<F>
}

/**
 * An object mapping move changes to a function that performs the piece list changes for that action.
 */
const changeFuncs: ChangeApplication<genericChangeFunc> = {
	forward: {
		"add": addPiece,
		"delete": deletePiece,
		"move": movePiece,
		"capture": capturePiece,
	},
	backward: {
		"delete": addPiece,
		"add": deletePiece,
		"move": returnPiece,
		"capture": uncapturePiece,
	}
};


// Adding changes to a Move ----------------------------------------------------------------------------------------


/**
 * Queues a move with catpure
 * Need to differentiate this from move so animations can work and so that royal capture can be recognised
 * @param changes
 * @param piece The piece moved. Its coords are used as starting coords
 * @param main - Whether this change is affecting the main piece moved, not a secondary piece.
 * @param endCoords 
 * @param capturedPiece The piece captured
 */
function queueCapture(changes: Array<Change>, piece: Piece, main: boolean, endCoords: Coords, capturedPiece: Piece, path?: Coords[]) {
	const change: Change = { action: 'capture', main, piece: piece, endCoords: endCoords, capturedPiece: capturedPiece };
	if (path !== undefined) change.path = path;
	changes.push(change);
	return changes;
}

/**
 * Queues the addition of a piece to the board
 * @param changes 
 * @param piece the piece to add
 * the pieces index is optional and will get assigned one if none is present
 */
function queueAddPiece(changes: Array<Change>, piece: Piece) {
	changes.push({ action: 'add', main: false, piece }); // It's impossible for an 'add' change to affect the main piece moved, because before this move this piece didn't exist.
	return changes;
};

/**
 * Queues the removal of a piece by adding that Change to the Changes list.
 * @param changes - The running list of Changes for the move.
 * @param piece - The piece this change affects
 * @param main - Whether this change is affecting the main piece moved, not a secondary piece.
 */
function queueDeletePiece(changes: Array<Change>, piece: Piece, main: boolean) {
	changes.push({ action: 'delete', main, piece });
	return changes;
}

/**
 * Moves a piece without capture
 * @param changes 
 * @param piece The piece moved. Its coords are used as starting coords
 * @param main - Whether this change is affecting the main piece moved, not a secondary piece.
 * @param endCoords 
 */
function queueMovePiece(changes: Array<Change>, piece: Piece, main: boolean, endCoords: Coords, path?: Coords[]) {
	const change: Change = { action: 'move', main, piece: piece, endCoords };
	if (path !== undefined) change.path = path;
	changes.push(change);
	return changes;
}


// Executing changes of a Move ----------------------------------------------------------------------------------------


/**
 * Applies the board changes of a move either forward or backward,
 * either modifying the piece lists, or modifying the mesh,
 * depending on what changeFuncs are passed in.
 */
function runChanges(gamefile: gamefile, changes: Change[], changeFuncs: ChangeApplication<genericChangeFunc>, forward: boolean = true) {
	const funcs = forward ? changeFuncs.forward : changeFuncs.backward;
	applyChanges(gamefile, changes, funcs, forward);
}

/**
 * Applies the logical board changes of a change list in the provided order, modifying the piece lists.
 * @param gamefile the gamefile
 * @param changes the changes to apply
 * @param funcs the object contain change funcs
 * @param forward whether to apply changes in forward order (true) or reverse order (false)
 */
function applyChanges(gamefile: gamefile, changes: Array<Change>, funcs: ActionList<genericChangeFunc>, forward: boolean) {
	if (forward) {
		// Iterate forwards through the changes array
		for (const change of changes) {
			if (!(change.action in funcs)) throw Error(`Missing change function for likely-invalid change action "${change.action}"!`);
            funcs[change.action]!(gamefile, change);
		}
	} else {
		// Iterate backwards through the changes array so the move's changes are reverted in the correct order
		for (let i = changes.length - 1; i >= 0; i--) {
			const change = changes[i]!;
			if (!(change.action in funcs)) throw Error(`Missing change function for likely-invalid change action "${change.action}"!`);
            funcs[change.action]!(gamefile, change);
		}
	}
}

/**
 * Most basic add-a-piece method. Adds it the gamefile's piece list,
 * organizes the piece in the organized lists
 */
function addPiece(gamefile: gamefile, change: Change) { // desiredIndex optional
	const piece = change.piece;

	// Safety net
	const isPieceOnCoords = gamefileutility.isPieceOnCoords(gamefile, piece.coords);
	if (isPieceOnCoords) throw new Error("Can't add a piece on top of another piece!");

	const list = gamefile.ourPieces[piece.type];
	
	// If no index specified, make the default the first undefined in the list!
	if (piece.index === undefined) {
		if (list.undefineds.length === 0) throw Error(`No undefined placeholders remaining for piece being added! ${piece.type}`);
		change.piece.index = list.undefineds.shift()!;
	} else jsutil.deleteElementFromOrganizedArray(gamefile.ourPieces[piece.type].undefineds, piece.index); // Remove the undefined from the undefineds list

	// Add the piece
	list[piece.index] = piece.coords;
	organizedlines.organizePiece(piece.type, piece.coords, gamefile);
	
	// Do we need to add more undefineds?
	// Only adding pieces can ever reduce the number of undefineds we have, so we do that here!
	if (organizedlines.isTypeShortOnUndefineds(gamefile, piece.type)) organizedlines.addMoreUndefinedsToType(gamefile, piece.type);
}

/**
 * Most basic delete-a-piece method. Deletes it from the gamefile's piece list,
 * from the organized lists.
 */
function deletePiece(gamefile: gamefile, change: Change) {
	if (change.piece.index === undefined) {
		console.warn("Deleted piece does not have index supplied! Attemping to get idx from other info");
		console.log(change);
		change.piece = gamefileutility.getPieceFromTypeAndCoords(gamefile, change.piece.type, change.piece.coords);
	}
	const piece = change.piece;

	const list = gamefile.ourPieces[piece.type];
	gamefileutility.deleteIndexFromPieceList(list, piece.index);

	// Remove captured piece from organized piece lists
	organizedlines.removeOrganizedPiece(gamefile, piece.coords);
}


/**
 * Most basic move-a-piece method. Adjusts its coordinates in the gamefile's piece lists,
 * reorganizes the piece in the organized lists, and updates its mesh data.
 * 
 * If the move is a capture, then use capturePiece() instead, so that we can animate it.
 * @param gamefile - The gamefile
 * @param change - the move data
 */
function movePiece(gamefile: gamefile, change: Change) {
	if (change.action !== 'move' && change.action !== 'capture') throw new Error(`movePiece called with a non-move change: ${change.action}`);

	const piece = change.piece;
	const endCoords = change.endCoords;

	// Move the piece, change the coordinates
	gamefile.ourPieces[piece.type][piece.index] = endCoords;

	// Remove selected piece from all the organized piece lists (piecesOrganizedByKey, etc.)
	organizedlines.removeOrganizedPiece(gamefile, piece.coords);

	// Add the piece to organized lists with new destination
	organizedlines.organizePiece(piece.type, endCoords, gamefile);
}

/**
 * Reverses `movePiece`
 */
function returnPiece(gamefile: gamefile, change: Change) {
	if (change.action !== 'move' && change.action !== 'capture') throw new Error(`returnPiece called with a non-move change: ${change.action}`);

	const piece = change.piece;
	const endCoords = change.endCoords;

	// Move the piece, change the coordinates
	gamefile.ourPieces[piece.type][piece.index] = piece.coords;

	// Remove selected piece from all the organized piece lists (piecesOrganizedByKey, etc.)
	organizedlines.removeOrganizedPiece(gamefile, endCoords);

	// Add the piece to organized lists with old destination
	organizedlines.organizePiece(piece.type, piece.coords, gamefile);
}

/**
 * Captures a piece.
 * 
 * This is differentiated from move changes so it can be animated.
 */
function capturePiece(gamefile: gamefile, change: Change) {
	if (change.action !== 'capture') throw new Error(`capturePiece called with a non-capture change: ${change.action}`);

	deletePiece(gamefile, { piece: change.capturedPiece, main: change.main, action: "add" });
	movePiece(gamefile, change);
}

/**
 * Undos a capture
 */
function uncapturePiece(gamefile: gamefile, change: Change) {
	if (change.action !== 'capture') throw new Error(`uncapturePiece called with a non-capture change: ${change.action}`);

	returnPiece(gamefile, change);
	addPiece(gamefile, { piece: change.capturedPiece, main: change.main, action: "add" });
}

/**
 * Gets every captured piece in changes
 */
function getCapturedPieces(move: Move): Piece[] {
	const pieces: Piece[] = [];
	move.changes.forEach(change => {
		if (change.action === 'capture') pieces.push(change.capturedPiece);
	});
	return pieces;
}

/**
 * Returns true if any piece was captured by the move, whether directly or by special actions.
 */
function wasACapture(move: Move): boolean {
	// Safety net if we ever accidentally call this method too soon.
	// There will never be a valid move with zero changes, that's just absurd.
	if (move.changes.length === 0) throw Error("Move doesn't have it's changes calculated yet, do that before this.");
	return move.changes.some(change => change.action === 'capture');
}

export type {
	genericChangeFunc,
	ActionList,
	ChangeApplication,
	Change,
	Piece,
};

export default {
	changeFuncs,
	queueCapture,
	queueAddPiece,
	queueDeletePiece,
	queueMovePiece,
	runChanges,
	getCapturedPieces,
	oneWayActions,
	wasACapture,
};