let ghostirCore = 'https://localhost:7094'

chrome.alarms.create('followingNotification', {
    when: Date.now(),
    periodInMinutes: 1
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "followingNotification") {
        chrome.storage.sync.get('accessToken', async function (result) {
            const validationInformationFetchPromise = await fetch(`${ghostirCore}/Twitch/GetValidationInformation`);
            const validationInformationData = await validationInformationFetchPromise.json();
            
            const fetchPromise = await fetch('https://api.twitch.tv/helix/users', {
                headers: {
                    'Authorization': 'Bearer ' + result.accessToken,
                    'Client-Id': validationInformationData.TwitchId
                }
            });

            if (fetchPromise.status === 200) {
                chrome.storage.sync.get('notifyList', async function (result) {
                    let notifyList = [];
                    if(result.notifyList !== undefined) {
                        notifyList = result.notifyList.split(',');
                    }
                    
                    const returnedData = await fetchPromise.json();
                    const notificationFollowingFetchPromise = await fetch(`${ghostirCore}/Twitch/NotificationFollowing?authToken=${result.accessToken}&notifyList=${notifyList.join(',')}&parameterList={"userId":"${returnedData.data[0].id}"}`);
                    const notificationFollowingData = await notificationFollowingFetchPromise.text();

                    if (notificationFollowingData !== "") {
                        chrome.notifications.clear("followingNotification_Alert");
                        chrome.notifications.create('followingNotification_Alert', {
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