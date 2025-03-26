
/**
 * This script runs a chess engine for checkmate practice that computes the best move for the black royal piece.
 * It is called as a WebWorker from enginegame.js so that it can run asynchronously from the rest of the website.
 * You may specify a different engine to be used by specifying a different engine name in the gameOptions when initializing an engine game.
 * 
 * @author noob10293
 * some basic i/o and boilerplate code from engineCheckmatePractice by Andreas Tsevas
 * some code turned out pretty similar to the engines in dev-utils, but that's mostly a coincidence. Some other code was inspired by those after I realized they existed
 * some ideas/inspiration from https://www.youtube.com/watch?v=U4ogK0MIzqk and https://www.youtube.com/watch?v=w4FFX_otR-4
 * some code written by ChatGPT
 */



/**
 * Typescript types are erased during compilation, so adding these
 * here doesn't actually mean adding dependancies.
 */
// @ts-ignore
import gamefile from "../../../chess/logic/gamefile";
import type { Move, MoveDraft } from "../../../chess/logic/movepiece";
import type { Coords } from "../../../chess/util/coordutil";
import type { Vec2 } from "../../../util/math";
//@ts-ignore
import gamefileutility from '../../../chess/util/gamefileutility.js';
//@ts-ignore
import legalmoves, { LegalMoves } from '../../../chess/logic/legalmoves.js';
//@ts-ignore
import gameformulator from "../gameformulator.js";
//@ts-ignore
import specialdetect from "../../../chess/logic/specialdetect.js";
import jsutil from "../../../util/jsutil.js";
// If the Webworker during creation is not declared as a module, than type imports will have to be imported this way:
// type gamefile = import("../../chess/logic/gamefile").default;
// type MoveDraft = import("../../chess/logic/movepiece").MoveDraft;
// type Coords = import("../../chess/util/coordutil").Coords;
// type Vec2 = import("../../util/math").Vec2;

/**
 * Let the main thread know that the Worker has finished fetching and
 * its code is now executing! We may now hide the spinny pawn loading animation.
 */
postMessage('readyok');



// Here, the engine webworker received messages from the outside
self.onmessage = function(e: MessageEvent) {
	// console.log("E");
	const message = e.data;
	// input_gamefile = message.gamefile;
	input_gamefile = gameformulator.formulateGame(message.lf);
	// initvariant.initPieceMovesets(input_gamefile,input_gamefile.metadata);
	// console.log(input_gamefile);
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
	"queen": 1,
	"rook": 2,
	"bishop": 3,
	"knight": 4,
	"king": 5,
	"pawn": 6,
	"amazon": 7,
	"hawk": 8,
	"chancellor": 9,
	"archbishop": 10,
	"knightrider": 11,
	"huygen": 12
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


	// weights for piece values according to Rayo(10¹⁰⁰) - ω₁ᶜʰ'³ | Lℕ Harrytubby0184
	pieceExistenceEvalDictionary = {
		0: 0, // 0 corresponds to a captured piece
		1: -1_750_000, // queen
		2: -875_000, // rook
		3: -500_000, // bishop
		4: -312_500, // knight
		5: 0, // king - cannot be captured
		6: -100_000, // pawn
		7: -1_750_000, // amazon
		8: -875_000, // hawk
		9: -1_375_000, // chancellor
		10: -500_000, // archbishop
		11: -312_500, // knightrider
		12: -875_000 // huygen
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

	// if (weAre === "black") {
	// 	for (const delta of pawnDeltas) {
	// 		delta.dy = -delta.dy;
	// 	}
	// }
	
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
function enginePieceTypeToPieceType(enginePieceType: EnginePieceType, color: "white" | "black"): string {
	return `${enginePieceType}s${color[0]!.toUpperCase()}`;
}

function pieceTypeToEnginePieceType(pieceType: string): EnginePieceType {
	return pieceType.slice(0, -2) as EnginePieceType;
}
let moveschecked = 0;
/**
 * This function is called from outside and initializes the engine calculation given the provided gamefile
 */
async function runEngine() {
	//todo: get rid of the try thing?
	// todo: make enginegame handle engine not returing move in time better?
	// todo: handle different difficulties on differently fast devices?
	try {
		// if ((gamefile.ourPieces.kingsB?.length ?? 0) !== 0) {// if black king exists in our pieces
		// 	weAre = "black"; //we refers to the engine
		// } else if ((gamefile.ourPieces.kingsW?.length ?? 0) !== 0) {
		// 	weAre = "white";
		// } else {
		// 	return console.error("No king found in our pieces!");
		// }
		// create list of types and coords of white pieces, in order to initialize start_piecelist and start_coordlist
		// todo: represent pieces better, move this into a func
		piecelistours = [];
		coordlistours = [];
		piecelisttheirs = [];
		coordlisttheirs = [];

		for (const key in input_gamefile.piecesOrganizedByKey) {
			const pieceType = input_gamefile.piecesOrganizedByKey[key]!;
			if (pieceType.slice(-1).toLowerCase() === weAre[0]) {
				const coords = key.split(',').map(Number);
				piecelistours.push(pieceTypeToEnginePieceType(pieceType));
				coordlistours.push([coords[0]!, coords[1]!]);
			} else if (pieceType.slice(-1).toLowerCase() === theyAre[0]) {
				const coords = key.split(',').map(Number);
				piecelisttheirs.push(pieceTypeToEnginePieceType(pieceType));
				coordlisttheirs.push([coords[0]!, coords[1]!]);
			} else {
				return console.error("Piece is not white or black!");
			}
		}
		console.log("NEW");
		const moves:Set<MoveDraft> = new Set();
		const t = Date.now();
		
		getLegalMoves( moves);

		globallyBestMove = Array.from(moves)[Math.floor(Math.random() * moves.size)]!;
		// console.log(isBlackInTrap(start_piecelist, start_coordlist));
		// console.log(get_white_candidate_moves(start_piecelist, start_coordlist));
		// console.log(globalSurvivalPlies);
		// console.log(globallyBestVariation);
		// console.log(enginePositionCounter);
		console.log("moveschecked:", moveschecked, "mstimetaken:", (Date.now() - t), "legalmoves:", moves.size, "bestmove:", globallyBestMove);
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

function getLegalMoves( moves: Set<MoveDraft>) {
	for (let i = 0; i < coordlistours.length; i++) {
		const ourcoord = coordlistours[i]!;
		const ourpiece = piecelistours[i]!;
		const piecemoved = gamefileutility.getPieceAtCoords(input_gamefile, ourcoord);
		const legalMoves = legalmoves.calculate(input_gamefile, piecemoved!);
		console.log(legalMoves, ourpiece);
		// get the moves for our piece
		for (let j = 0; j < coordlisttheirs.length; j++) {
			const theircoord = coordlisttheirs[j]!;
			const theirpiece = piecelisttheirs[j]!;
			//todo: don't check for all pieces if its a non-sliding piece, check for own pieces as well? if it is
			getPieceMoves(ourpiece, legalMoves, moves, ourcoord, theirpiece, theircoord);
		}
		// Check intersections with our own pieces
		// verification should handle intersection w/ own piece, todo: check this for more optimization?
		for (let k = 0; k < coordlistours.length; k++) {
			const othercoord = coordlistours[k]!;
			const otherpiece = piecelistours[k]!;
			// alr checked all non sliding piece moves
			if (isSlidingPiece(ourpiece)) {
				getPieceMoves(ourpiece, legalMoves, moves, ourcoord, otherpiece, othercoord);
			}
		}
		// todo: intersections of intersections?
	}
}

function getPieceMoves(ourpiece: EnginePieceType, legalMoves: LegalMoves, moves: Set<MoveDraft>, ourcoord: Coords,theirpiece: EnginePieceType,theircoord: Coords) {
	if (!isSlidingPiece(ourpiece)) {
		const pieceMoves = legalMoves.individual;
		for (const mv of pieceMoves) {
			moveschecked++;
			// check if move is already in
			if (hasDraft(moves, { startCoords: ourcoord, endCoords: mv })) continue;

			const md: MoveDraft = { startCoords: ourcoord, endCoords: mv };
			if (mv.promoteTrigger) {
				moveschecked--;
				handlePromotion(mv, md, moves); // if promotion handled, don't add the move
				continue;
			}
			specialdetect.transferSpecialFlags_FromCoordsToMove(mv, md);
			moves.add(md);
		}
	} else {
		const intersections = getIntersectionBetweenTwoPieces(ourcoord, ourpiece, theircoord, theirpiece);
		for (const move of intersections) {
			moveschecked++;
			//doesnt intersect
			if (move.intersection === null) continue;
			//move is to same square
			if (move.intersection === ourcoord) continue;
			// they on same line
			if (move.intersection === "infinite") {move.intersection = theircoord;}
			// verification should handle trying to move to friendly piece square, todo: maybe check this for more optimization?

			if (move.move1.kind === "point") continue; //will never happen, todo: change ts to avoid having to do this

			verifyAndAddMove(moves, legalMoves, ourcoord, move.intersection);
			getWiggleRoomSquares(move.move1.line.type, wiggleroomDictionary[pieceNameDictionary[ourpiece]!]!, move.intersection).forEach((wiggleRoomSquare) => {
				moveschecked--;
				verifyAndAddMove(moves, legalMoves, ourcoord, wiggleRoomSquare);
			});
		}
	}
	return moveschecked;
}

function handlePromotion(mv: any, md: MoveDraft, moves: Set<MoveDraft>) {
	delete mv.promoteTrigger;
	specialdetect.transferSpecialFlags_FromCoordsToMove(mv, md);
	const promotablePieces = ["queen", "rook", "bishop", "knight"];
	for (const enginePieceType of promotablePieces) {
		md.promotion = enginePieceTypeToPieceType(enginePieceType as EnginePieceType, weAre);
		moveschecked++;
		moves.add(jsutil.deepCopyObject(md));
	}
}

function verifyAndAddMove(moves: Set<MoveDraft>, legalMoves: any, ourcoord: Coords, toCoord:Coords) {
	moveschecked++;

	// check if move is already in
	if (hasDraft(moves, { startCoords: ourcoord, endCoords: toCoord })) return;

	// check if illegal
	//todo: dont check if alr checked, aka transposition table?
	// console.log(legalmoves.checkIfMoveLegal(legalMoves, ourcoord, toCoord),ourpiece,toCoord,theirpiece);
	if (!legalmoves.checkIfMoveLegal(input_gamefile, legalMoves, ourcoord, toCoord, weAre)) {
		//console.log("NOPE");
		return;
	} //else console.log(legalmoves.checkIfMoveLegal(legalMoves, ourcoord, toCoord),ourpiece,toCoord,theirpiece);
	moves.add({ startCoords: ourcoord, endCoords: toCoord });
}

//todo: optimize by not checking on other side of square if occupied?
function getWiggleRoomSquares(lineType: QueenLineType, wiggleRoom: number, coord: Coords,excludeOwn = true): Coords[] {
	const nearbySquares: Coords[] = [];
	const deltas: { dx: number, dy: number }[] = [];

	switch (lineType) {
		case "horizontal":
			deltas.push({ dx: 1, dy: 0 }, { dx: -1, dy: 0 });
			break;
		case "vertical":
			deltas.push({ dx: 0, dy: 1 }, { dx: 0, dy: -1 });
			break;
		case "diag1": // (\) diagonal
			deltas.push({ dx: 1, dy: 1 }, { dx: -1, dy: -1 });
			break;
		case "diag2": // (/) diagonal
			deltas.push({ dx: 1, dy: -1 }, { dx: -1, dy: 1 });
			break;
	}

	for (const { dx, dy } of deltas) {
		for (let i = 1; i <= wiggleRoom; i++) {
			nearbySquares.push([coord[0] + i * dx, coord[1] + i * dy]);
		}
	}

	return nearbySquares;
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

// todo: promotion, 50 move rule?, 3 fold repetition?

// not needed anymore
// explicitly includes own position
// Deltas for knight and pawn and king (assuming white pawn moving upward).
// const knightDeltas = [
// 	{ dx: 0, dy: 0 },
// 	{ dx: 2, dy: 1 }, { dx: 2, dy: -1 },
// 	{ dx: -2, dy: 1 }, { dx: -2, dy: -1 },
// 	{ dx: 1, dy: 2 }, { dx: 1, dy: -2 },
// 	{ dx: -1, dy: 2 }, { dx: -1, dy: -2 },
// ];
// const pawnDeltas = [
// 	{ dx: 0, dy: 0 },
// 	{ dx: 0, dy: 1 },
// 	{ dx: -1, dy: 1 }, { dx: 1, dy: 1 },//captures
// 	{ dx: 0, dy: 2 },//double move
// ];
// //todo: add castling and en passant special move/coords flags?? and promotion?
// const kingDeltas = [
// 	{ dx: 0, dy: 0 },
// 	{ dx: 0, dy: 1 }, { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
// 	{ dx: 1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: -1, dy: -1 },
// 	{ dx: -2, dy: 0 },{ dx: 2, dy: 0 },//castling
// ];

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
		// case 'knight': return deltasToMovelist(knightDeltas, p);
		// case 'pawn': return deltasToMovelist(pawnDeltas, p);
		// case 'king': return deltasToMovelist(kingDeltas, p);
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

	// if (!isSlidingPiece(piece1)) {
	// 	const moves1 = getMoves(coord1, piece1);
	// 	moves1.forEach(m1 => intersections.push({//dummy values except interseciton
	// 		pointIndex1: 0,
	// 		pointIndex2: 0,
	// 		move1: { kind: 'point', point: [0,0] },
	// 		move2: { kind: 'point', point: [0,0] },
	// 		intersection: m1.kind === 'point' ? [m1.point[0], m1.point[1]] : null
	// 	}));
	// 	return intersections;
	// }

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
