
// Import Start
import colorutil from "./colorutil.js";
// Import End

/**
 * This script contains lists of all piece types currently in the game,
 * and has utility methods for iterating through them.
 */

/**
 * All piece types the game is currently compatible with (excluding neutrals),
 * without their color information appended.
 * 
 * They are arranged in this order for faster checkmate/draw detection,
 * as we should check if the kings have a legal move first.
 */
const types = ['kings', 'giraffes', 'camels', 'zebras', 'knightriders', 'amazons', 'queens', 'royalQueens', 'hawks', 'chancellors', 'archbishops', 'centaurs', 'royalCentaurs', 'roses', 'knights', 'guards', 'huygens', 'rooks', 'bishops', 'pawns'];
/** All neutral types the game is compatible with. */
const neutralTypes = ['obstacles', 'voids'];

/** A list of the royals that are compatible with checkmate. If a royal can slide, DO NOT put it in here, put it in {@link slidingRoyals} instead! */
const jumpingRoyals = ['kings', 'royalCentaurs'];
/**
 * A list of the royals that the checkmate algorithm cannot detect when they are in checkmate,
 * however it still is illegal to move into check.
 * 
 * Players have to voluntarily resign if they
 * belive their sliding royal is in checkmate.
 */
const slidingRoyals = ['royalQueens'];
/**
 * A list of the royal pieces, without the color appended.
 * THIS SHOULD NOT CONTAIN DUPLICATES
 */
const royals = [...jumpingRoyals, ...slidingRoyals];

/**
 * An object containing each color in the game, and all piece types associated with that color:
 * `{ white: ['kingsW', 'queensW'...], black: ['kingsB', 'queensB'...], neutral: ['obstaclesN','voidsN'] }`
 */
const colorsTypes = {};
colorutil.validColors_NoNeutral.forEach((color, index) => {
	const colorExtension = colorutil.validColorExtensions_NoNeutral[index];
	colorsTypes[color] = types.map(type => type + colorExtension);
});
colorsTypes.neutral = neutralTypes.map(type => type + colorutil.colorExtensionOfNeutrals);

/** Piece types that don't have an SVG */
const SVGLESS_TYPES = ['voids'];



/**
 * Iterates through every single piece TYPE in the game state, and performs specified function on the type.
 * @param {function} callback - The function to execute on each type of piece. Must have 1 parameter of "type".
 * @param {Object} [options] - An object that may contain the options `ignoreNeutrals` or `ignoreVoids`. These default to *false*.
 */
function forEachPieceType(callback, { ignoreNeutrals, ignoreVoids } = {}) { // Callback needs to have 1 parameter: type
	// Iterate through all colors in reverse order.
	// We do it in reverse so that white mini images
	// are rendered on top of black ones.
	Object.keys(colorsTypes).reverse().forEach(color => {
		if (ignoreNeutrals && color === colorutil.colorOfNeutrals) return; // Skip 'neutral' if ignoreNeutrals is true
		colorsTypes[color].forEach(type => {
			if (ignoreVoids && type.startsWith('voids')) return; // Skip voids if ignoreVoids is true
			callback(type);
		});
	});
}

export default {
	types,
	neutralTypes,
	colorsTypes,
	royals,
	jumpingRoyals,
	slidingRoyals,
	SVGLESS_TYPES,
	forEachPieceType,
};