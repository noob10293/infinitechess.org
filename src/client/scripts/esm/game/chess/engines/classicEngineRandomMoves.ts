
/**
 * This script runs a chess engine for checkmate practice that computes the best move for the black royal piece.
 * It is called as a WebWorker from enginegame.js so that it can run asynchronously from the rest of the website.
 * You may specify a different engine to be used by specifying a different engine name in the gameOptions when initializing an engine game.
 * 
 * @author noob10293
 * some basic i/o and boilerplate code from engineCheckmatePractice by Andreas Tsevas
 * some ideas/inspiration from https://www.youtube.com/watch?v=U4ogK0MIzqk and https://www.youtube.com/watch?v=w4FFX_otR-4
 * some code written by ChatGPT Reason
 */



/**
 * Typescript types are erased during compilation, so adding these
 * here doesn't actually mean adding dependancies.
 */
// @ts-ignore
import gamefile from "../../../chess/logic/gamefile";
import type { MoveDraft } from "../../../chess/logic/movepiece";
import type { Coords } from "../../../chess/util/coordutil";
import type { Vec2 } from "../../../util/math";
//@ts-ignore
import gamefileutility from '../../../chess/util/gamefileutility.js';
//@ts-ignore
import legalmoves from '../../../chess/logic/legalmoves.js';
//@ts-ignore
import copyutils from "../getGamefile.js";
// If the Webworker during creation is not declared as a module, than type imports will have to be imported this way:
// type gamefile = import("../../chess/logic/gamefile").default;
// type MoveDraft = import("../../chess/logic/movepiece").MoveDraft;
// type Coords = import("../../chess/util/coordutil").Coords;
// type Vec2 = import("../../util/math").Vec2;



// Here, the engine webworker received messages from the outside
self.onmessage = function(e: MessageEvent) {
	// console.log("E");
	const message = e.data;
	// input_gamefile = message.gamefile;
	input_gamefile = copyutils.getGamefile(message.lf);
	// initvariant.initPieceMovesets(input_gamefile,input_gamefile.metadata);
	console.log(input_gamefile);
	engineTimeLimitPerMoveMillis = message.engineConfig.engineTimeLimitPerMoveMillis;
	globallyBestScore = -Infinity;
	globallyBestVariation = {};

	weAre = message.engineConfig.engineIs;
	theyAre = weAre === "white" ? "black" : "white";

	if (!engineInitialized) initEvalWeightsAndSearchProperties();	// initialize the eval function weights and global search properties
	
	engineStartTime = Date.now();
	enginePositionCounter = 0;
	runEngine();
};


/** Whether the engine has already been initialized for the current game */
let engineInitialized: boolean = false;

/** Externally supplied gamefile */
let input_gamefile : gamefile;

/** Start time of current engine calculation in millis */
let engineStartTime: number;
/** The number of positions evaluated by this engine in total during current calculation */
let enginePositionCounter: number;
/** Time limit for the engine to think in milliseconds */
let engineTimeLimitPerMoveMillis: number;

// the ID of the currently selected checkmate
let checkmateSelectedID: string;

// The informtion that is currently considered best by this engine
let globallyBestMove: MoveDraft = { startCoords: [0, 0], endCoords: [0, 0] };
let globallyBestScore: number;
let globalSurvivalPlies: number;
let globallyBestVariation: { [key: number]: [number, Coords] };
// e.g. { 0: [NaN, [1,0]], 1: [3,[2,4]], 2: [NaN, [-1,1]], 3: [2, [5,6]], ... } = { 0: black move, 1: white piece index & move, 2: black move, ... }

// only used for parsing in the position
const pieceNameDictionary: { [pieceType: string]: number } = {
	// 0 corresponds to a captured piece
	"queensW": 1,
	"rooksW": 2,
	"bishopsW": 3,
	"knightsW": 4,
	"kingsW": 5,
	"pawnsW": 6 ,
	"amazonsW": 7,
	"hawksW": 8,
	"chancellorsW": 9,
	"archbishopsW": 10,
	"knightridersW": 11,
	"huygensW": 12
};

function invertPieceNameDictionary(json: { [key: string]: number }) {
	const inv: { [key: number]: string } = {};
	for (const key in json) {
		inv[json[key]!] = key;
	}
	return inv;
}

const invertedPieceNameDictionaty = invertPieceNameDictionary(pieceNameDictionary);

// legal move storage for pieces in piecelist
const pieceTypeDictionary: { [key: number]: { rides?: Vec2[], jumps?: Vec2[], is_royal?: boolean, is_pawn?: boolean, is_huygen?: boolean } } = {
	// 0 corresponds to a captured piece
	1: {rides: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]}, // queen
	2: {rides: [[1, 0], [0, 1], [-1, 0], [0, -1]]}, // rook
	3: {rides: [[1, 1], [-1, -1], [1, -1], [-1, 1]]}, // bishop
	4: {jumps: [[1, 2], [-1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, 1], [-2, -1]]}, // knight
	5: {jumps: [[-1, 1], [0, 1], [1, 1], [-1, 0], [1, 0], [-1, -1], [0, -1], [1, -1]], is_royal: true}, // king
	6: {jumps: [[0, 1]], is_pawn: true}, //pawn
	7: {rides: [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]],
		jumps: [[1, 2], [-1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, 1], [-2, -1]]}, // amazon
	8: {jumps: [[2, 0], [3, 0], [2, 2], [3, 3], [0, 2], [0, 3], [-2, 2], [-3, 3], [-2, 0], [-3, 0],
		[-2, -2], [-3, -3], [0, -2], [0, -3], [2, -2], [3, -3]]}, //hawk
	9: {rides: [[1, 0], [0, 1], [-1, 0], [0, -1]],
		jumps: [[1, 2], [-1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, 1], [-2, -1]]}, // chancellor
	10: {rides: [[1, 1], [-1, -1], [1, -1], [-1, 1]],
		jumps: [[1, 2], [-1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, 1], [-2, -1]]}, // archbishop
	11: {rides: [[1, 2], [-1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, 1], [-2, -1]]}, // knightrider
	12: {jumps: [[2, 0], [-2, 0], [0, 2], [0, -2]],
		 rides: [[1, 0], [0, 1], [-1, 0], [0, -1]], is_huygen: true } // huygen
};

// weights for the evaluation function
let pieceExistenceEvalDictionary: { [key: number]: number };

// number of candidate squares for white rider pieces to consider along a certain direction (2*wiggleroom + 1)
let wiggleroomDictionary: { [key: number]: number };

/**
 * This method initializes the weights the evaluation function according to the checkmate ID provided, as well as global search properties
 */
function initEvalWeightsAndSearchProperties() {


	// weights for piece values of white pieces TODO: replace with actual values
	pieceExistenceEvalDictionary = {
		0: 0, // 0 corresponds to a captured piece
		1: -1_000_000, // queen
		2: -800_000, // rook
		3: -100_000, // bishop
		4: -800_000, // knight
		5: 0, // king - cannot be captured
		6: -100_000, // pawn
		7: -1_000_000, // amazon
		8: -800_000, // hawk
		9: -800_000, // chancellor
		10: -800_000, // archbishop
		11: -800_000, // knightrider
		12: -800_000 // huygen
	};

	// number of candidate squares for white rider pieces to consider around an intersection
	wiggleroomDictionary = {
		1: 1, // queen
		2: 2, // rook
		3: 2, // bishop
		7: 1, // amazon
		9: 1, // chancellor
		10: 1, // archbishop
		11: 1, // knightrider
		12: 5 // huygen
	};

	if (weAre === "black") {
		for (const delta of pawnDeltas) {
			delta.dy = -delta.dy;
		}
	}
	
	engineInitialized = true;
}

// we refers to the engine
let weAre: "white" | "black";
let theyAre: "white" | "black";

// White pieces.
let coordlistours: Coords[]; // list of white pieces in starting position, eg ["queen", "rook", "bishop", ...]
let piecelistours: EnginePieceType[]; // list of tuples, like [[2,3], [5,6], [6,7], ...], pieces are corresponding to ordering in start_piecelist

// Black pieces.
let coordlisttheirs: Coords[];
let piecelisttheirs: EnginePieceType[];

function arraysEqual(a: any[], b: Array<any>): boolean {
	return a.every((val: any, idx: number) => val === b[idx]);
}
  

const hasDraft = (myObjectSet: Set<MoveDraft>,draft: MoveDraft): boolean => {
	for (const myObject of myObjectSet) {
		// console.log(myObject.startCoords,myObject.endCoords,draft.startCoords,draft.endCoords);
		if (arraysEqual(myObject.startCoords, draft.startCoords) && arraysEqual(myObject.endCoords, draft.endCoords)) {
			// console.log("YEP");
			return true;
		}
	}
  
	return false;
};


/**
 * This function is called from outside and initializes the engine calculation given the provided gamefile
 */
async function runEngine() {
	try {
		// if ((gamefile.ourPieces.kingsB?.length ?? 0) !== 0) {// if black king exists in our pieces
		// 	weAre = "black"; //we refers to the engine
		// } else if ((gamefile.ourPieces.kingsW?.length ?? 0) !== 0) {
		// 	weAre = "white";
		// } else {
		// 	return console.error("No king found in our pieces!");
		// }
		// create list of types and coords of white pieces, in order to initialize start_piecelist and start_coordlist
		piecelistours = [];
		coordlistours = [];
		piecelisttheirs = [];
		coordlisttheirs = [];

		for (const key in input_gamefile.piecesOrganizedByKey) {
			const pieceType = input_gamefile.piecesOrganizedByKey[key]!;
			if (pieceType.slice(-1).toLowerCase() === weAre[0]) {
				const coords = key.split(',').map(Number);
				// start_piecelistwhite.push(pieceNameDictionary[pieceType]!);
				piecelistours.push(pieceType.slice(0,-2));
				// shift all white pieces, so that the black royal is at [0,0]
				coordlistours.push([coords[0]!,coords[1]!]);
			} else if (pieceType.slice(-1).toLowerCase() === theyAre[0]) {
				const coords = key.split(',').map(Number);
				// start_piecelistblack.push(pieceNameDictionary[pieceType]!);
				piecelisttheirs.push(pieceType.slice(0,-2));
				coordlisttheirs.push([coords[0]!,coords[1]!]);
			} else {
				return console.error("Piece is not white or black!");
			}
		}
		console.log("NEW");
		const moves:Set<MoveDraft> = new Set();
		// get the moves for our piece
		for (let i = 0; i < coordlistours.length; i++) {
			const ourcoord = coordlistours[i]!;
			const ourpiece = piecelistours[i]!;
			const piecemoved = gamefileutility.getPieceAtCoords(input_gamefile, ourcoord);
			const legalMoves = legalmoves.calculate(input_gamefile, piecemoved!);
			// console.log(legalMoves,ourpiece);
			//todo: don't check for all pieces if its a non-sliding piece, check for own pieces as well if it is
			for (let j = 0; j < coordlisttheirs.length; j++) {
				const theircoord = coordlisttheirs[j]!;
				const theirpiece = piecelisttheirs[j]!;
				const intersections = getIntersectionBetweenTwoPieces(ourcoord,ourpiece,theircoord, theirpiece);
				for (const move of intersections) {
					//doesnt intersect
					if (move.intersection === null) continue;
					//move is to same square
					if (move.intersection === ourcoord) continue;
					// they on same line
					if (move.intersection === "infinite") move.intersection = theircoord;

					// check if move is already in
					if (hasDraft(moves,{ startCoords: ourcoord, endCoords: move.intersection })) {continue;}

					// check if illegal
					//todo: dont check if alr checked
					// console.log(legalmoves.checkIfMoveLegal(legalMoves, ourcoord, move.intersection),ourpiece,move.intersection,theirpiece);
					if (!legalmoves.checkIfMoveLegal(legalMoves, ourcoord, move.intersection)) {//console.log("NOPE");
						continue;} //else console.log(legalmoves.checkIfMoveLegal(legalMoves, ourcoord, move.intersection),ourpiece,move.intersection,theirpiece);

					moves.add({ startCoords: ourcoord, endCoords: move.intersection });
				}
			}
		}
		globallyBestMove = Array.from(moves)[Math.floor(Math.random() * moves.size)]!;
		// console.log(isBlackInTrap(start_piecelist, start_coordlist));
		// console.log(get_white_candidate_moves(start_piecelist, start_coordlist));
		// console.log(globalSurvivalPlies);
		// console.log(globallyBestVariation);
		// console.log(enginePositionCounter);

		// submit engine move after enough time has passed
		const time_now = Date.now();
		if (time_now - engineStartTime < engineTimeLimitPerMoveMillis) {
			await new Promise(r => setTimeout(r, engineTimeLimitPerMoveMillis - (time_now - engineStartTime)));
		}
		postMessage(globallyBestMove);

	} catch (e) {
		console.error("An error occured in the engine computation");
		console.error(e);
	}
}






//diagonals, horizontals and verticals all represented by a single value
// diag 1 is top left to bottom right(\), value is y intercept
// diag 2 is top right to bottom left(/), value is also y intercept
type QueenLineType = 'vertical' | 'horizontal' | 'diag1' | 'diag2';
interface QueenLine { type: QueenLineType; value: number; }
type EnginePieceType = 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn'|"king";
type EngineMove = { kind: 'line'; line: QueenLine } | { kind: 'point'; point: Coords };
type Intersection = { pointIndex1: number; pointIndex2: number; move1: EngineMove; move2: EngineMove; intersection: Coords | null | "infinite" };

// Helpers for line moves.
// implicitly includes own position so intersections can intersect self so they can capture
function rookMoves(p: Coords): EngineMove[] {
	return [
		{ kind: 'line', line: { type: 'vertical', value: p[0] } },
		{ kind: 'line', line: { type: 'horizontal', value: p[1] } },
	];
}

function bishopMoves(p: Coords): EngineMove[] {
	return [
		{ kind: 'line', line: { type: 'diag1', value: p[1] - p[0] } },
		{ kind: 'line', line: { type: 'diag2', value: p[1] + p[0] } },
	];
}
// todo: promotion, checkmate, stalemate, 50 move rule, 3 fold repetition
// explicitly includes own position
// Deltas for knight and pawn and king (assuming white pawn moving upward).
const knightDeltas = [
	{ dx: 0, dy: 0 },
	{ dx: 2, dy: 1 }, { dx: 2, dy: -1 },
	{ dx: -2, dy: 1 }, { dx: -2, dy: -1 },
	{ dx: 1, dy: 2 }, { dx: 1, dy: -2 },
	{ dx: -1, dy: 2 }, { dx: -1, dy: -2 },
];
const pawnDeltas = [
	{ dx: 0, dy: 0 },
	{ dx: 0, dy: 1 },
	{ dx: -1, dy: 1 }, { dx: 1, dy: 1 },//captures
	{ dx: 0, dy: 2 },//double move
];
//todo: add castling and en passant special move/coords flags??
const kingDeltas = [
	{ dx: 0, dy: 0 },
	{ dx: 0, dy: 1 }, { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
	{ dx: 1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 },
	{ dx: -2, dy: 0 },{ dx: 2, dy: 0 },//castling
];

const nonSlidingPieces = new Set<EnginePieceType>(["knight", "king", "pawn"]);

const isSlidingPiece = (piece: EnginePieceType): boolean => !nonSlidingPieces.has(piece);

function deltasToMovelist(deltas: { dx: number; dy: number; }[], p: Coords): EngineMove[] {
	return deltas.map(({ dx, dy }) => ({ kind: 'point', point: [p[0] + dx, p[1] + dy] }));
}

// Generate moves for a given point and chess piece.
function getMoves(p: Coords, piece: EnginePieceType): EngineMove[] {
	switch (piece) {
		case 'queen': return [...rookMoves(p), ...bishopMoves(p)];
		case 'rook': return rookMoves(p);
		case 'bishop': return bishopMoves(p);
		case 'knight': return deltasToMovelist(knightDeltas, p);
		case 'pawn': return deltasToMovelist(pawnDeltas, p);
		case 'king': return deltasToMovelist(kingDeltas, p);
		default: return [];
	}
}

// Intersect two line moves using a sorted order (vertical < horizontal < diag1 < diag2).
// Returns the intersection point, null if no intersection, or "infinite" if the lines are the same.
function intersectLines(a: QueenLine, b: QueenLine): Coords | null | "infinite" {
	if (a.type === b.type) return a.value === b.value ? "infinite" : null;

	const order: Record<QueenLineType, number> = { vertical: 0, horizontal: 1, diag1: 2, diag2: 3 };
	// order the lines in the order above so that we only have to put one combination and the math works out right
	if (order[a.type] > order[b.type]) [a, b] = [b, a];

	switch (`${a.type}_${b.type}`) {
		case 'vertical_horizontal': return [a.value, b.value];
		case 'vertical_diag1':      return [a.value, a.value + b.value];
		case 'vertical_diag2':      return [a.value, b.value - a.value];
		case 'horizontal_diag1':    return [a.value - b.value, a.value];
		case 'horizontal_diag2':    return [b.value - a.value, a.value];
		case 'diag1_diag2': {
			const x = (b.value - a.value) / 2;
			return [x, x + a.value];
		}
		default: return null;
	}
};

// Check if a point lies on a given line.
function pointOnLine(line: QueenLine, p: Coords): boolean {
	switch (line.type) {
		case 'vertical':   return p[0] === line.value;
		case 'horizontal': return p[1] === line.value;
		case 'diag1':      return p[1] - p[0] === line.value;
		case 'diag2':      return p[1] + p[0] === line.value;
		default: return false;
	}
};

// Intersect two moves (line vs. line, line vs. point, or point vs. point).
// returns the coords of the intersection, null if no interesction, or "infinite" if the lines are the same.
function intersectMoves(m1: EngineMove, m2: EngineMove): Coords | null | "infinite" {
	if (m1.kind === 'line' && m2.kind === 'line') return intersectLines(m1.line, m2.line);
	if (m1.kind === 'line' && m2.kind === 'point')
		return pointOnLine(m1.line, m2.point) ? m2.point : null;
	if (m1.kind === 'point' && m2.kind === 'line')
		return pointOnLine(m2.line, m1.point) ? m1.point : null;
	if (m1.kind === 'point' && m2.kind === 'point')
		return (m1.point[0] === m2.point[0] && m1.point[1] === m2.point[1]) ? m1.point : null;
	return null;
};

// Process a list of points and return intersections for a specified piece movement type.
// returns, list of intersections(index of the points in the list, the move of the first point, the move of the second point, the intersection coords, null, or inf)
function getAllIntersections(points: Coords[], piece: EnginePieceType) {
	const movesList = points.map(p => getMoves(p, piece));
	const intersections: Intersection[] = [];

	movesList.forEach((moves1, i) => {
		for (let j = i + 1; j < movesList.length; j++) {
			moves1.forEach(m1 => movesList[j]!.forEach(m2 => {
				const inter = intersectMoves(m1, m2);
				if (inter !== null) {
					intersections.push({ pointIndex1: i, pointIndex2: j, move1: m1, move2: m2, intersection: inter });
				}
			}));
		}
	});

	return intersections;
}

// proceses 2 points and move types and returns their intersections
// returns, list of intersections(index of the points in the list, the move of the first point, the move of the second point, the intersection coords, null, or inf)
// todo: wiggleroom?, general getmoves function, more efficient move types to check logic, better return type
function getIntersectionBetweenTwoPieces(
	coord1: Coords, piece1: EnginePieceType,
	coord2: Coords, piece2: EnginePieceType
): Intersection[] {
	// const moves1 = getMoves(coord1, piece1);
	// const moves2 = getMoves(coord2, piece2);

	// todo: move to general func
	const intersections: Intersection[] = [];
	if (!isSlidingPiece(piece1)) {
		const moves1 = getMoves(coord1, piece1);
		moves1.forEach(m1 => intersections.push({//dummy values except interseciton
			pointIndex1: 0,
			pointIndex2: 0,
			move1: { kind: 'point', point: [0,0] },
			move2: { kind: 'point', point: [0,0] },
			intersection: m1.kind === 'point' ? [m1.point[0], m1.point[1]] : null
		}));
		return intersections;
	}

	const moves1 = getMoves(coord1, "queen");
	const moves2 = getMoves(coord2, "queen");

	moves1.forEach(m1 => {
		moves2.forEach(m2 => {
			const inter = intersectMoves(m1, m2);
			if (inter !== null) {
				intersections.push({
					pointIndex1: 0,
					pointIndex2: 1,
					move1: m1,
					move2: m2,
					intersection: inter
				});
			}
		});
	});
	return intersections;
}
  
// Example usage:
// const points: Coords[] = [
// 	[2, 3],
// 	[5, 1],
// 	[4, 4],
// ];
// const pieces: EnginePieceType[] = ['queen', 'rook', 'bishop'];

// for (const p of points) {
// 	console.log(`Piece at ${p}:`);
// 	console.log(getMoves(p, 'queen'));
// }

// console.log("Queen intersections:", getAllIntersections(points, 'queen'));
// console.log("Rook intersections:", getAllIntersections(points, 'rook'));
// console.log("Bishop intersections:", getAllIntersections(points, 'bishop'));
// console.log("Knight intersections:", getAllIntersections(points, 'knight'));
// console.log("Pawn intersections:", getAllIntersections(points, 'pawn'));
