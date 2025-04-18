import style from "../../../game/gui/style.js";
import preferences from "../preferences.js";
import checkerboardgenerator from "../../../chess/rendering/checkerboardgenerator.js";
import themes from "../themes.js";


// Document Elements -------------------------------------------------------------------------


const boardDropdownTitle = document.querySelector('.board-dropdown .dropdown-title');
const boardDropdown = document.querySelector('.board-dropdown');
const themeList = document.querySelector('.theme-list'); // Get the theme list div



// Functions ---------------------------------------------------------------------------------


(function init() {
	addThemesToThemesDropdown();
})();


async function addThemesToThemesDropdown() {

	const themeDictionary = themes.themes;

	// Loop through each theme in the dictionary
	for (const themeName in themeDictionary) {
		const theme = themeDictionary[themeName];
		const lightTiles = theme.lightTiles;
		const darkTiles = theme.darkTiles;

		// Create the checkerboard image for the theme
		const checkerboardImage = await checkerboardgenerator.createCheckerboardIMG(
			style.arrayToCssColor(lightTiles), // Convert to CSS color format
			style.arrayToCssColor(darkTiles),  // Convert to CSS color format
			2 // Width
		);
		checkerboardImage.setAttribute('theme', themeName);
		checkerboardImage.setAttribute('draggable', 'false');

		// Append the image to the theme list div
		themeList.appendChild(checkerboardImage);
	}

	updateThemeSelectedStyling();

}


function open() {
	boardDropdown.classList.remove('visibility-hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	initListeners();
}
function close() {
	boardDropdown.classList.add('visibility-hidden'); // The stylesheet adds a short delay animation to when it becomes hidden
	closeListeners();
}

function initListeners() {
	boardDropdownTitle.addEventListener('click', close);
	initThemeChangeListeners();
}
function closeListeners() {
	boardDropdownTitle.removeEventListener('click', close);
	closeThemeChangeListeners();
}
function initThemeChangeListeners() {
	for (let i = 0; i < themeList.children.length; i++) {
		const theme = themeList.children[i];
		theme.addEventListener('click', selectTheme);
	}
}
function closeThemeChangeListeners() {
	for (let i = 0; i < themeList.children.length; i++) {
		const theme = themeList.children[i];
		theme.removeEventListener('click', selectTheme);
	}
}


function selectTheme(event) {
	const selectedTheme = event.target.getAttribute('theme');

	// Saves it to browser storage
	preferences.setTheme(selectedTheme);

	updateThemeSelectedStyling();
	
	// Dispatch a custom event for theme change so that any game code present can pick it up.
	document.dispatchEvent(new Event('theme-change'));
}
/** Outlines in black the current theme selection */
function updateThemeSelectedStyling() {
	const selectedTheme = preferences.getTheme();
	for (let i = 0; i < themeList.children.length; i++) {
		const theme = themeList.children[i];
		if (selectTheme && theme.getAttribute('theme') === selectedTheme) theme.classList.add('selected');
		else theme.classList.remove('selected');
	}
}

export default {
	open,
	close
};