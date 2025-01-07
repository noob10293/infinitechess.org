
/**
 * This script contains the logic for loading any kind of game onto our game board:
 * * Local
 * * Online
 * * Analysis Board (in the future)
 * * Board Editor (in the future)
 * 
 * It not only handles the logic of the gamefile,
 * but also prepares and opens the UI elements for that type of game.
 */

// @ts-ignore
import timeutil from "../../util/timeutil.js";
// @ts-ignore
import guiclock from "../gui/guiclock.js";
// @ts-ignore
import guigameinfo from "../gui/guigameinfo.js";
// @ts-ignore
import guinavigation from "../gui/guinavigation.js";
// @ts-ignore
import sound from '../misc/sound.js';
// @ts-ignore
import onlinegame from "../misc/onlinegame/onlinegame.js";
// @ts-ignore
import drawoffers from "../misc/drawoffers.js";
// @ts-ignore
import localstorage from "../../util/localstorage.js";
// @ts-ignore
import perspective from "../rendering/perspective.js";
import gui from "../gui/gui.js";
import gameslot from "./gameslot.js";
import clock from "../../chess/logic/clock.js";


// Type Definitions --------------------------------------------------------------------


// @ts-ignore
import type { GameRules } from "../../chess/variants/gamerules.js";
import type { MetaData } from "../../chess/util/metadata.js";
import type { Coords, CoordsKey } from "../../chess/util/coordutil.js";
import type { ClockValues } from "../../chess/logic/clock.js";
import type { DisconnectInfo, DrawOfferInfo } from "../misc/onlinegamerouter.js";
import localgame from "../misc/localgame/localgame.js";


// Type Definitions --------------------------------------------------------------------


/**
 * Variant options that can be used to load a custom game,
 * whether local or online, instead of one of the default variants.
 */
interface VariantOptions {
	/**
	 * The full move number of the turn at the provided position. Default: 1.
	 * Can be higher if you copy just the positional information in a game with some moves played already.
	 */
	fullMove: number,
	/** The square enpassant capture is allowed, in the starting position specified (not after all moves are played). */
	enpassant?: Coords,
	gameRules: GameRules,
	/** If the move moveRule gamerule is present, this is a string of its current state and the move rule number (e.g. `"0/100"`) */
	moveRule?: `${number}/${number}`,
	/** A position in ICN notation (e.g. `"P1,2+|P2,2+|..."`) */
	positionString: string,
	/**
	 * The starting position object, containing the pieces organized by key.
	 * The key of the object is the coordinates of the piece as a string,
	 * and the value is the type of piece on that coordinate (e.g. `"pawnsW"`)
	 */
	startingPosition: { [key: CoordsKey]: string }
	/** The special rights object of the gamefile at the starting position provided, NOT after the moves provided have been played. */
	specialRights: { [key: CoordsKey]: true },
}


// Variables --------------------------------------------------------------------


/**
 * True if we are in ANY type of game, whether local, online, analysis, or editor.
 * 
 * If we're on the title screen or the lobby, this will be false.
 */
let inAGame: boolean = false;

/** The type of game we are in, whether local or online, if we are in a game. */
let typeOfGameWeAreIn: undefined | 'local' | 'online';


// Getters --------------------------------------------------------------------


/**
 * Returns true if we are in ANY type of game, whether local, online, analysis, or editor.
 * 
 * If we're on the title screen or the lobby, this will be false.
 */
function areInAGame(): boolean {
	return inAGame;
}

/**
 * Updates whatever game is currently loaded, for what needs to be updated.
 */
function update() {
	if (typeOfGameWeAreIn === 'online') onlinegame.update();
}


// Start Game --------------------------------------------------------------------


/** Starts a local game according to the options provided. */
async function startLocalGame(options: {
	/** Must be one of the valid variants in variant.ts */
	Variant: string,
	TimeControl: MetaData['TimeControl'],
}) {
	const gameOptions = {
		metadata: {
			...options,
			Event: `Casual local ${translations[options.Variant]} infinite chess game`,
			Site: 'https://www.infinitechess.org/' as 'https://www.infinitechess.org/',
			Round: '-' as '-',
			UTCDate: timeutil.getCurrentUTCDate(),
			UTCTime: timeutil.getCurrentUTCTime()
		}
	};

	await loadGame(gameOptions, true, true);
	typeOfGameWeAreIn = 'local';
	localgame.initLocalGame();
}

/**
 * Starts an online game according to the options provided by the server.
 */
async function startOnlineGame(options: {
	gameConclusion: string | false,
	/** The id of the online game */
	id: string,
	metadata: MetaData,
	/** Existing moves, if any, to forward to the front of the game. Should be specified if reconnecting to an online. Each move should be in the most compact notation, e.g., `['1,2>3,4','10,7>10,8Q']`. */
	moves: string[],
	publicity: 'public' | 'private',
	variantOptions?: VariantOptions,
	youAreColor: 'white' | 'black',
	/** Provide if the game is timed. */
	clockValues?: ClockValues,
	drawOffer: DrawOfferInfo,
	/** If our opponent has disconnected, this will be present. */
	disconnect?: DisconnectInfo,
	/**
	 * If our opponent is afk, this is how many millseconds left until they will be auto-resigned,
	 * at the time the server sent the message. Subtract half our ping to get the correct estimated value!
	 */
	millisUntilAutoAFKResign?: number,
	/** If the server us restarting soon for maintenance, this is the time (on the server's machine) that it will be restarting. */
	serverRestartingAt?: number,
}) {
	// console.log("Starting online game with invite options:");
	// console.log(jsutil.deepCopyObject(options));

	// If the clock values are provided, adjust the timer of whos turn it is depending on ping.
	if (options.clockValues) options.clockValues = clock.adjustClockValuesForPing(options.clockValues);
	
	// Must be set BEFORE loading the game, because the mesh generation relies on the color we are.
	if (options.publicity === 'private') options.variantOptions = localstorage.loadItem(options.id);
	const fromWhitePerspective = options.youAreColor === 'white';

	await loadGame(options, fromWhitePerspective, false);
	typeOfGameWeAreIn = 'online';
	onlinegame.initOnlineGame(options);
}








/**
 * Starts a game according to the options provided.
 * @param {Object} gameOptions - An object that contains the properties `metadata`, `moves`, `gameConclusion`, `variantOptions`, `clockValues`
 * @param {boolean} fromWhitePerspective - True if the game should be loaded from white's perspective, false for black's perspective
 * @param {boolean} allowEditCoords - Whether the loaded game should allow you to edit your coords directly
 */
async function loadGame(
	gameOptions: {
		metadata: MetaData,
		/** Should be provided if we're rejoining an online game. */
		clockValues?: ClockValues,
		/** Should be provided if we're rejoining an online game. */
		gameConclusion?: string | false,
		/**
		 * This will be a string array of all the moves played thus far, in the most compact notation (e.g. `["5,2>5,4", ...]`)
		 * 
		 * Should be provided if we're pasting a game, or rejoining an online game.
		 */
		moves?: string[],
		/**
		 * Provide to load a custom variant game, or a normal variant where moves have been played,
		 * instead of starting the variant that is specified in the metadata.
		 * 
		 * Should be provided if we're pasting a game, or rejoining a custom online private game.
		 */
		variantOptions?: VariantOptions,
	},
	/** If false, we'll be viewing black's perspective. */
	fromWhitePerspective: boolean,
	allowEditCoords: boolean
) {
	// console.log("Loading game with game options:");
	// console.log(gameOptions);

	await gameslot.loadGamefile(gameOptions.metadata, fromWhitePerspective, { // Pass in the pre-existing moves
		moves: gameOptions.moves,
		variantOptions: gameOptions.variantOptions,
		gameConclusion: gameOptions.gameConclusion,
		clockValues: gameOptions.clockValues
	});
	
	const gamefile = gameslot.getGamefile()!;
	guinavigation.open(gamefile, { allowEditCoords }); // Editing your coords allowed in local games
	guigameinfo.open(gameOptions.metadata);
	guiclock.set(gamefile);
    
	sound.playSound_gamestart();

	inAGame = true;
}

function unloadGame() {
	onlinegame.closeOnlineGame();
	guinavigation.close();
	guigameinfo.close();
	gameslot.unloadGame();
	perspective.disable();
	gui.prepareForOpen();
	inAGame = false;
	typeOfGameWeAreIn = undefined;
}


export default {
	areInAGame,
	update,
	startLocalGame,
	startOnlineGame,
	loadGame,
	unloadGame,
};