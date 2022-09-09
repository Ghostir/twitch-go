const usingChromium = typeof window.chrome !== 'undefined';
const usingFirefox = typeof window.browser !== 'undefined';
const browser = usingFirefox ? window.browser : window.chrome;

function initAdBlocker() {
    console.log('Called Ghost Guard');
    const script = document.createElement('script');
    script.src = browser.runtime.getURL('ghost-guard.js');
    (document.body || document.head || document.documentElement).appendChild(script);
}

browser.storage.local.get(['adBlocker'], function(result) {
    let adBlocker = true;
    if(result.adBlocker !== undefined) {
        adBlocker = result.adBlocker;
    }

    if(adBlocker) {
        console.log('Initialized Ghost Guard');
        initAdBlocker()
    }
});