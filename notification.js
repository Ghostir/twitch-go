const usingFirefox = typeof browser !== 'undefined';
const browserType = usingFirefox ? 'Firefox' : 'Chrome';
const currentBrowser = usingFirefox ? browser : chrome;

//let ghostirCore = 'https://core.ghostir.net'
let ghostirCore = 'https://localhost:7094'

currentBrowser.alarms.create('followingNotification', {
    when: Date.now(),
    periodInMinutes: 1
});

currentBrowser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "followingNotification") {
        currentBrowser.storage.sync.get('accessToken', async function (tokenResult) {
            const validationInformationFetchPromise = await fetch(`${ghostirCore}/Twitch/GetValidationInformation?browserType=${browserType}`);
            const validationInformationData = await validationInformationFetchPromise.json();

            const fetchPromise = await fetch('https://api.twitch.tv/helix/users', {
                headers: {
                    'Authorization': 'Bearer ' + tokenResult.accessToken,
                    'Client-Id': validationInformationData.TwitchId
                }
            });

            if (fetchPromise.status === 200) {
                currentBrowser.storage.sync.get('notifyList', async function (notifyResult) {
                    let notifyList = [];
                    if(notifyResult.notifyList !== undefined) {
                        notifyList = notifyResult.notifyList.split(',');
                    }

                    const returnedData = await fetchPromise.json();
                    const notificationFollowingFetchPromise = await fetch(`${ghostirCore}/Twitch/NotificationFollowing?authToken=${tokenResult.accessToken}&browserType=${browserType}&notifyList=${notifyList.join(',')}&parameterList={"userId":"${returnedData.data[0].id}"}`);
                    const notificationFollowingData = await notificationFollowingFetchPromise.text();

                    if (notificationFollowingFetchPromise.status === 200 && notificationFollowingData !== "") {
                        currentBrowser.notifications.clear("followingNotification_Alert");
                        currentBrowser.notifications.create('followingNotification_Alert', {
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