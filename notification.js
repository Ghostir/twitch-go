chrome.alarms.create('testAlarm', {
    periodInMinutes: 1
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "testAlarm") {
        $('html').remove();
    }
});