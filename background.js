
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
    chrome.alarms.create('testAlarm', {
		periodInMinutes: 1
	});
	
	chrome.alarms.onAlarm.addListener((alarm) => {
		if (alarm.name === "testAlarm") {
			document.querySelector('html').remove();
		}
	});
}); 
