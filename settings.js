const usingFirefox = typeof window.browser !== 'undefined';
const browser = usingFirefox ? window.browser : window.chrome;

// This is a Direct click of the Theater Mode button within the Twitch Player
browser.storage.sync.get(['autoTheaterMode']).then(result => {
    // I'm also checking that the Player is not already in Theater Mode, this avoids exiting Theater Mode if another Extension is already doing it.
    const foundPlayer = document.querySelectorAll('[class="video-player__container--theatre"]');
    if(result.autoTheaterMode && foundPlayer.length <= 0) {
        document.querySelectorAll('[data-a-target="player-theatre-mode-button"]')[0].click();
    }
});