

import uuid from "../../client/scripts/esm/util/uuid.js";
import { isBrowserIDBanned } from "../middleware/banned.js";
import { logEvents } from "../middleware/logEvents.js";



const expireOfBrowserIDCookieMillis = 1000 * 60 * 60 * 24 * 7; // 7 days



/**
 * Assigns/renews the browser-id cookie to all requests for an html file.
 * If they have an existing browser id, it renews it for 7 more days.
 * If they don't, it gives them a new browser id for 7 day.
 * @param {Object} req - The Express request object.
 * @param {Object} res - The Express response object.
 * @param {Function} next - The Express next middleware function.
 */
function assignOrRenewBrowserID(req, res, next) {
	if (!req.cookies) {
		logEvents("req.cookies must be parsed before setting browser-id cookie!", 'errLog.txt', { print: true });
		return next();
	}

	if (req.headers.origin !== undefined || !req.accepts('html')) return next(); // A fetch request, but we only want to set the browser-id cookie on HTML requests. HTML requests will have an origin of undefined

	if (!req.cookies['browser-id']) giveBrowserID(res);
	else refreshBrowserID(req, res);

	next();
}

function giveBrowserID(res) {

	const cookieName = 'browser-id';
	const id = uuid.generateID(12);

	console.log(`Assigning new browser-id: ${id} --------`);

	// Readable by server with web socket connections, NOT by javascript: MAX AGE IN MILLIS NOT SECS
	res.cookie(cookieName, id, { httpOnly: true, sameSite: 'None', secure: true, maxAge: expireOfBrowserIDCookieMillis /* 1 day */ });
}

function refreshBrowserID(req, res) {

	const cookieName = 'browser-id';
	const id = req.cookies[cookieName];

	if (isBrowserIDBanned(id)) return makeBrowserIDPermanent(req, res, id);

	// console.log(`Renewing browser-id: ${id}`);

	// Readable by server with web socket connections, NOT by javascript
	res.cookie(cookieName, id, { httpOnly: true, sameSite: 'None', secure: true, maxAge: expireOfBrowserIDCookieMillis });
}

function makeBrowserIDPermanent(req, res, browserID) {
	// Readable by server with web socket connections, NOT by javascript: MAX AGE IN MILLIS NOT SECS
	res.cookie('browser-id', browserID, { httpOnly: true, sameSite: 'None', secure: true, maxAge: Number.MAX_SAFE_INTEGER /* FOREVER!! */ });

	const logThis = `Making banned browser-id PERMANENT: ${browserID} !!!!!!!!!!!!!!!!!!! ${req.headers.origin}   ${req.method}   ${req.url}   ${req.headers['user-agent']}`;
	logEvents(logThis, 'bannedIPLog.txt', { print: true });
}

export {
	assignOrRenewBrowserID,
};