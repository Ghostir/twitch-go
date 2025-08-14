const usingFirefox = typeof window.browser !== 'undefined';
const browser = usingFirefox ? window.browser : window.chrome;

// Listen for a call from the Background, which is checking for a Tab Update (Only way to catch URL updates from Twitch)
browser.runtime.onMessage.addListener((media, sender, sendResponse) => {
    if (media.event === 'autoTheaterMode') {
        browser.storage.sync.get(['autoTheaterMode']).then(result => {
            
            // I'm also checking that the Player is not already in Theater Mode, this avoids exiting Theater Mode if another Extension is already doing it.
            const foundPlayer = document.querySelectorAll('.video-player__container--theatre');
            if(result.autoTheaterMode && foundPlayer.length <= 0) {
                const theaterModeButton = document.querySelectorAll('[data-a-target="player-theatre-mode-button"]')[0];
                if (theaterModeButton !== undefined) {
                    theaterModeButton.click();
                }
            }
        });
    }
})

// Initial Setting of the Theater Mode
browser.storage.sync.get(['autoTheaterMode']).then(result => {
    const foundPlayer = document.querySelectorAll('.video-player__container--theatre');
    if(result.autoTheaterMode && foundPlayer.length <= 0) {
        const theaterModeButton = document.querySelectorAll('[data-a-target="player-theatre-mode-button"]')[0];
        if (theaterModeButton !== undefined) {
            theaterModeButton.click();
        }
    }
});