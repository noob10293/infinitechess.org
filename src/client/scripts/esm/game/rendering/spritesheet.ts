
/**
 * This script stores the spritesheet FOR THE CURRENT GAME,
 * and all the piece's texture coordinates within it.
 * 
 * If no game is loaded, no spritesheet is loaded.
 */


// @ts-ignore
import type gamefile from '../../chess/logic/gamefile.js';
import type { Coords } from '../../chess/logic/movesets.js';



import { generateSpritesheet } from '../../chess/rendering/spritesheetGenerator.js';
import svgtoimageconverter from '../../util/svgtoimageconverter.js';
import svgcache from '../../chess/rendering/svgcache.js';
import jsutil from '../../util/jsutil.js';
// @ts-ignore
import typeutil from '../../chess/util/typeutil.js';
// @ts-ignore
import texture from './texture.js';



// Variables ---------------------------------------------------------------------------


/**
 * The spritesheet texture for rendering the pieces of the current game.
 * 
 * Using a spritesheet instead of 1 texture for each piece allows us to
 * render all the pieces with a single mesh, and a single texture.
 */
let spritesheet: WebGLTexture | undefined; // Texture. Grid containing every texture of every piece, black and white.
/**
 * Contains where each piece is located in the spritesheet (texture coord).
 * Texture coords of a piece range from 0-1, where (0,0) is the bottom-left corner.
 */
let spritesheetData: {
	/** The width of each texture in the whole spritesheet, as a fraction. */
	pieceWidth: number,
	/**
	 * The texture locations of each piece type in the spritesheet,
	 * where (0,0) is the bottom-left corner of the spritesheet,
	 * and the coordinates provided are the bottom-left corner of the corresponding type.
	 */
	texLocs: { [type: string]: Coords }
} | undefined;



// Functions ---------------------------------------------------------------------------


function getSpritesheet() {
	if (!spritesheet) throw new Error("Should not be getting the spritesheet when not loaded!");
	return spritesheet!;
}

function getSpritesheetDataPieceWidth() {
	if (!spritesheetData) throw new Error("Should not be getting piece width when the spritesheet is not loaded!");
	return spritesheetData!.pieceWidth;
}

function getSpritesheetDataTexLocation(type: string): Coords {
	if (!spritesheetData) throw new Error("Should not be getting texture locations when the spritesheet is not loaded!");
	if (!spritesheetData!.texLocs[type]) throw Error("No texture location for piece type: " + type);
	return spritesheetData!.texLocs[type]!;
}

/** Loads the spritesheet texture we'll be using to render the provided gamefile's pieces */
async function initSpritesheetForGame(gl: WebGL2RenderingContext, gamefile: gamefile) {

	/** All piece types in the game. */
	let existingTypes: string[] = jsutil.deepCopyObject(gamefile.startSnapshot.existingTypes); // ['pawns','obstacles','voids', ...]
	// Remove the pieces that don't need/have an SVG, such as VOIDS
	existingTypes = existingTypes.filter(type => !typeutil.SVGLESS_TYPES.includes(type)); // ['pawns','obstacles', ...]
	// console.log('Existing types in game to construct spritesheet:', existingTypes);

	/** Makes all the types in the game singular instead of plural */
	const typesNeeded = existingTypes.map(type => type.slice(0, -1)); // Remove the "s" at the end => ['pawn','obstacle', ...]

	/**
	 * The SVG elements we will use in the game to construct our spritesheet
	 * This is what may take a while, waiting for the fetch requests to return.
	 */
	const svgElements = await svgcache.getSVGElementsFromSingularTypes(typesNeeded);

	// console.log("Finished acquiring all piece SVGs!");

	// Convert each SVG element to an Image
	const readyImages: HTMLImageElement[] = await svgtoimageconverter.convertSVGsToImages(svgElements);

	const spritesheetAndSpritesheetData = await generateSpritesheet(gl, readyImages);
	// console.log(spritesheetAndSpritesheetData.spritesheetData);

	// Optional: Append the spritesheet to the document for debugging
	// spritesheetAndSpritesheetData.spritesheet.style.display = 'none';
	// document.body.appendChild(spritesheetAndSpritesheetData.spritesheet);

	// Load the texture into webgl and initiate our spritesheet
	// data that contains the texture coordinates of each piece!
	spritesheet = texture.loadTexture(gl, spritesheetAndSpritesheetData.spritesheet, { useMipmaps: true });
	spritesheetData = spritesheetAndSpritesheetData.spritesheetData;
}

/**
 * Call when the gameslot unloads the gamefile.
 * The spritesheet and data is no longer needed.
 */
function deleteSpritesheet() {
	spritesheet = undefined;
	spritesheetData = undefined;
}



export default {
	initSpritesheetForGame,
	getSpritesheet,
	getSpritesheetDataPieceWidth,
	getSpritesheetDataTexLocation,
	deleteSpritesheet,
};