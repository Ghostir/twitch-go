const usingFirefox = typeof window.browser !== 'undefined';
const browserType = usingFirefox ? 'Firefox' : 'Chrome';
const browser = usingFirefox ? window.browser : window.chrome;

//let ghostirCore = 'https://core.ghostir.net'
let ghostirCore = 'https://localhost:7094'

browser.alarms.create('followingNotification', {
    when: Date.now(),
    periodInMinutes: 1
});

browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "followingNotification") {
        browser.storage.sync.get('accessToken', async function (tokenResult) {
            const validationInformationFetchPromise = await fetch(`${ghostirCore}/Twitch/GetValidationInformation?browserType=${browserType}`);
            const validationInformationData = await validationInformationFetchPromise.json();

            const fetchPromise = await fetch('https://api.twitch.tv/helix/users', {
                headers: {
                    'Authorization': 'Bearer ' + tokenResult.accessToken,
                    'Client-Id': validationInformationData.TwitchId
                }
            });

            if (fetchPromise.status === 200) {
                browser.storage.sync.get('notifyList', async function (notifyResult) {
                    let notifyList = [];
                    if(notifyResult.notifyList !== undefined) {
                        notifyList = notifyResult.notifyList.split(',');
                    }

                    const returnedData = await fetchPromise.json();
                    const notificationFollowingFetchPromise = await fetch(`${ghostirCore}/Twitch/NotificationFollowing?authToken=${tokenResult.accessToken}&browserType=${browserType}&notifyList=${notifyList.join(',')}&parameterList={"userId":"${returnedData.data[0].id}"}`);
                    const notificationFollowingData = await notificationFollowingFetchPromise.text();

                    if (notificationFollowingData !== "") {
                        browser.notifications.clear("followingNotification_Alert");
                        browser.notifications.create('followingNotification_Alert', {
                            type: 'basic',
                            iconUrl: 'img/logo.png',
                            title: 'Just went Live',
                            message: notificationFollowingData,
                            priority: 2
                        });
                    }
                });
            }
        });
    }
});