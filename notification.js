const usingFirefox = typeof browser !== 'undefined';
const browserType = usingFirefox ? 'Firefox' : 'Chrome';
const currentBrowser = usingFirefox ? browser : chrome;

// let ghostirCore = 'https://ghostir.net'
let ghostirCore = 'https://localhost:7191'
currentBrowser.runtime.onMessage.addListener(() => {});
currentBrowser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        if (!(tab.url === undefined)) {
            if (!tab.url.startsWith('https://www.twitch.tv/')) {
                return;
            }

            currentBrowser.tabs.sendMessage(tab.id, {event: 'autoTheaterMode'}).then();
        }
    }
});

currentBrowser.alarms.create('followingNotification', {
    when: Date.now(),
    periodInMinutes: 1
});

currentBrowser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "followingNotification") {
        currentBrowser.storage.sync.get(['notificationEnabled']).then(result => {
            if(result.notificationEnabled) {
                currentBrowser.storage.sync.get('accessToken', async function (tokenResult) {
                    const validationInformationFetchPromise = await fetch(`${ghostirCore}/Twitch/API/GetValidationInformation?browserType=${browserType}`);
                    const validationInformationData = await validationInformationFetchPromise.json();

                    const fetchPromise = await fetch('https://api.twitch.tv/helix/users', {
                        headers: {
                            'Authorization': 'Bearer ' + tokenResult.accessToken,
                            'Client-Id': validationInformationData.TwitchId
                        }
                    });

                    if (fetchPromise.status === 200) {
                        const returnedData = await fetchPromise.json();
                        
                        currentBrowser.storage.sync.get('notifyList', async function (notifyResult) {
                            let notifyList = [];
                            if(notifyResult.notifyList !== undefined) {
                                notifyList = notifyResult.notifyList.split(',');
                            }
                            
                            const notificationFollowingFetchPromise = await fetch(`${ghostirCore}/Twitch/API/NotificationFollowing?authToken=${tokenResult.accessToken}&browserType=${browserType}&notifyList=${notifyList.join(',')}&userId=${returnedData.data[0].id}`);
                            const notificationFollowingData = await notificationFollowingFetchPromise.json();

                            if (notificationFollowingFetchPromise.status === 200 && notificationFollowingData !== "" && notificationFollowingData !== undefined && notificationFollowingData.length > 0) {
                                currentBrowser.notifications.clear("followingNotification_Alert");
                                currentBrowser.notifications.create('followingNotification_Alert', {
                                    type: 'basic',
                                    iconUrl: notificationFollowingData[0].avatar,
                                    title: notificationFollowingData[0].title,
                                    message: notificationFollowingData[0].subtitle,
                                    priority: 2
                                });
                            }
                        });

                        const res = await fetch(`${ghostirCore}/Twitch/API/GetOnlineCount?authToken=${tokenResult.accessToken}&browserType=${browserType}&userId=${returnedData.data[0].id}`);
                        const count = await res.json();
                        currentBrowser.action.setBadgeText({ text: count > 0 ? count.toString() : "" });
                        currentBrowser.action.setBadgeBackgroundColor({ color: "#9146FF" });
                    }
                });
            }
        });
    }
});