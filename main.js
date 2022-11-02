let userId = null;
let accessToken = null;
let clientId = null;
let twitchEndpoint = null;

let userSignedIn = false;
let validationInterval = null;

let ghostirCore = 'https://localhost:7094'

let favoriteList = [];
let notifyList = [];

let followedStreamReturnAmount = 100;
let topGamesReturnAmount = 100;
let topStreamsReturnAmount = 100;

chrome.storage.sync.get('userSignedIn', async function(result) {
	userSignedIn = result.userSignedIn
	
	const validationResponse = await validationInformation();
	if (validationResponse) {
		if (userSignedIn) {
			chrome.storage.sync.get('accessToken', async function (result) {
				accessToken = result.accessToken;
				await initApplication();
			});
		} else {
			await signOut();
		}
	} else {
		$("#defaultWrapper").hide();
		$("#loginWrapper").hide();
		$("#applicationWrapper").hide();
		$("#underMaintenanceWrapper").show();
	}
});

async function validationInformation() {
	return $.ajax({
		type: "GET",
		url: `${ghostirCore}/Twitch/GetValidationInformation`,
		success: async function(response){
			const returnedData = JSON.parse(response);
			twitchEndpoint = returnedData.TwitchEndpoint;
			clientId = encodeURIComponent(returnedData.TwitchId);
			return true;
		},
		error: function() {
			// Ghostir API is Down (This will most likely be the case if this Failed)
			// This usually occurs when the Hosting Server is Down for Maintenance
			return false;
		}
	});
}

async function initApplication() {
	$("#defaultWrapper").hide();
	$("#loginWrapper").hide();
	$("#applicationWrapper").show();

	await this.initializeSettings();
	await this.initializeSettingsChange();

	$('.nav-link').on('shown.bs.tab', async () => {
		await this.initializeSettings();
		const currentTab = $(".section-button.active")[0];
		const tabCode = $(currentTab).data('section-code');

		switch (tabCode) {
			case 'FollowingStreams':
				$("#followingListPlaceholder_Wrapper").show();
				$("#followingList_Wrapper").hide();
				await getFollowingList();
				break;
			case 'TopGames':
				$("#topGameListPlaceholder_Wrapper").show();
				$("#topGameList_Wrapper").hide();
				$("#topGameStreamList_Wrapper").hide();
				await getTopGameList();
				break;
			case 'TopStreams':
				$("#topStreamListPlaceholder_Wrapper").show();
				$("#topStreamList_Wrapper").hide();
				await getTopStreamList();
				break;
		}
		
		$('.tab-content').scrollTop(0);
	});

	await mainFunction();

	tippy('.toolTip', {
		placement: 'right',
		theme: 'material'
	});

	$('#signOut').on('click', async () => {
		await signOut();
	});
}

async function signOut() {
	// Removes the Twitch Access Token and sets the userSignedIn variable to False
	await chrome.storage.sync.set({ 'accessToken': null });
	await chrome.storage.sync.set({ 'userSignedIn': false });

	accessToken = null;
	userSignedIn = false;

	$("#applicationWrapper").hide();
	$("#underMaintenanceWrapper").hide();
	$("#defaultWrapper").hide();
	$("#loginWrapper").show();
	
	// Setting the Sign In/Out Button Events
	$('#signIn').on('click', () => {
		$('#signIn_Icon').attr("class", "fa fa-circle-notch fa-spin");
		signIn();
	});

	$('#resetAuthToken').on('click', () => {
		chrome.storage.sync.set({ 'accessToken': null });
		chrome.storage.sync.set({ 'userSignedIn': false });

		accessToken = null;
		userSignedIn = false;
	});
}

async function signIn() {
	if (userSignedIn) {
		$('#signIn_Icon').attr("class", "fa fa-check-circle");
	} else {
		chrome.identity.launchWebAuthFlow({
			url: twitchEndpoint,
			interactive: true
		}, async function (redirect_url) {
			if (chrome.runtime.lastError) {
				$('#signIn_Icon').attr("class", "fa fa-check-circle");
				$('#authError_Wrapper').html('There was an Issue Authenticating with Twitch.');
			} else {
				if (redirect_url === undefined || redirect_url.includes('error=access_denied') || redirect_url.includes('error=redirect_mismatch')) {
					$('#signIn_Icon').attr("class", "fa fa-check-circle");
					$('#authError_Wrapper').html('There was an Issue Authenticating with Twitch.');
				} else {
					$('#signIn_Icon').attr("class", "fa fa-check-circle");
					let tokenId = redirect_url.substring(redirect_url.indexOf('id_token=') + 9);
					tokenId = tokenId.substring(0, tokenId.indexOf('&'));
					accessToken = redirect_url.substring(redirect_url.indexOf('access_token=') + 13);
					accessToken = accessToken.substring(0, accessToken.indexOf('&'));
	
					const userInformation = JSON.parse(Base64.decode(tokenId.split(".")[1]));
					
					if (userInformation.iss === 'https://id.twitch.tv/oauth2' && userInformation.aud === clientId) {
						userSignedIn = true;
	
						validationInterval = setInterval(() => {
							fetch('https://id.twitch.tv/oauth2/validate', {
								headers: {
									'Authorization': 'OAuth ' + accessToken
								}
							}).then(res => {
								if (res.status === 401) {
									userSignedIn = false;
									clearInterval(validationInterval);
								}
							}).catch(err => console.log(err))
						}, 3600000);
						
						// Successful Authentication
						await chrome.storage.sync.set({ 'accessToken': accessToken });
						await chrome.storage.sync.set({ 'userSignedIn': userSignedIn });

						await initApplication();
						await mainFunction();
					}
				}
			}
		});
	}
}

async function mainFunction() {
    userId = await getCurrentUserId();
    await getFollowingList();
	await getTopGameList();
	await getTopStreamList();
	await getSearchList();

	initTabSearch();
	await initRefresh();
}

async function initializeSettings() {
	return new Promise((resolve) => {
		chrome.storage.sync.get(['darkMode', 'favoriteList', 'notifyList', 'followedStreamReturnAmount', 'topGamesReturnAmount', 'topStreamsReturnAmount'], function (result) {
			const darkModeCheckbox = $('#darkMode_Checkbox');
			let darkMode = darkModeCheckbox.is(":checked");
			if(result.darkMode !== undefined) {
				darkMode = result.darkMode;
			}

			if(darkMode) {
				darkModeCheckbox.prop('checked', true);
				$('#styleTheme').attr('href','./css/themes/dark.css');
			} else {
				darkModeCheckbox.prop('checked', false);
				$('#styleTheme').attr('href','./css/themes/light.css');
			}
			
			if(result.favoriteList !== undefined) {
				favoriteList = result.favoriteList.split(',');
			}

			if(result.notifyList !== undefined) {
				notifyList = result.notifyList.split(',');
			}

			if(result.followedStreamReturnAmount !== undefined) {
				followedStreamReturnAmount = parseInt(result.followedStreamReturnAmount ?? 100);
				$('#followedStreamReturnAmount_Input').val(followedStreamReturnAmount);
			}

			if(result.topGamesReturnAmount !== undefined) {
				topGamesReturnAmount = parseInt(result.topGamesReturnAmount ?? 100);
				$('#topGamesReturnAmount_Input').val(topGamesReturnAmount);
			}

			if(result.topStreamsReturnAmount !== undefined) {
				topStreamsReturnAmount = parseInt(result.topStreamsReturnAmount ?? 100);
				$('#topStreamsReturnAmount_Input').val(topStreamsReturnAmount);
			}
			
			resolve();
		});
	});
}

async function initializeSettingsChange() {
	const darkModeCheckbox = $('#darkMode_Checkbox');
	darkModeCheckbox.on('change', () => {
		const darkMode = $('#darkMode_Checkbox').is(":checked");
		chrome.storage.sync.set({ 'darkMode': darkMode });
		if(darkMode) {
			$('#styleTheme').attr('href','./css/themes/dark.css');
		} else {
			$('#styleTheme').attr('href','./css/themes/light.css');
		}
	});

	$('#followedStreamReturnAmount_Input').on('change', () => {
		const followedStreamReturnAmount = $('#followedStreamReturnAmount_Input').val();
		chrome.storage.sync.set({ 'followedStreamReturnAmount': followedStreamReturnAmount });
	});

	$('#topGamesReturnAmount_Input').on('change', () => {
		const topGamesReturnAmount = $('#topGamesReturnAmount_Input').val();
		chrome.storage.sync.set({ 'topGamesReturnAmount': topGamesReturnAmount });
	});

	$('#topStreamsReturnAmount_Input').on('change', () => {
		const topStreamsReturnAmount = $('#topStreamsReturnAmount_Input').val();
		chrome.storage.sync.set({ 'topStreamsReturnAmount': topStreamsReturnAmount });
	});
}

async function getCurrentUserId() {
	const fetchPromise = await fetch('https://api.twitch.tv/helix/users', {
		headers: {
			'Authorization': 'Bearer ' + accessToken,
			'Client-Id': clientId
		}
	});

	if (fetchPromise.status === 200) {
		const returnedData = await fetchPromise.json();
		return await returnedData.data[0].id;
	} else {
		await signOut();
	}
}

async function getFollowingList() {
	let cursor = null;

	const placeHolderWrapper = $("#followingListPlaceholder_Wrapper");
	const followingList = $("#followingList_Wrapper");

	return $.ajax({
		type: "GET",
		url: `${ghostirCore}/Twitch/GetFollowedStreamList?authToken=${accessToken}&returnAmount=${followedStreamReturnAmount}&favoriteList=${favoriteList.join(',')}&notifyList=${notifyList.join(',')}&parameterList={"userId":"${userId}"}`,
		success: async function(response){
			const returnedData = JSON.parse(response);

			followingList.html(returnedData.ReturnHtml);
			placeHolderWrapper.hide();
			followingList.show();

			$(".favorite-stream, .favorited-stream").click(async (event) => {
				const isFavorited = $(event.currentTarget).hasClass("favorited-stream");
				const streamId = $(event.currentTarget).data("streamid");

				if (isFavorited) {
					$(event.currentTarget).removeClass('favorited-stream');
					$(event.currentTarget).addClass('favorite-stream');

					favoriteList.remove(streamId);
					await chrome.storage.sync.set({ 'favoriteList': favoriteList.join(',') });
				} else {
					$(event.currentTarget).removeClass('favorite-stream');
					$(event.currentTarget).addClass('favorited-stream');

					if (favoriteList.length > 0 && streamId !== undefined) {
						favoriteList.push(streamId);
						const favoriteListFormatted = favoriteList.join(',');
						await chrome.storage.sync.set({ 'favoriteList': favoriteListFormatted });
					} else {
						const favoriteStreamList = [];
						favoriteStreamList.push(streamId);
						favoriteList = favoriteStreamList.join(',');
						await chrome.storage.sync.set({ 'favoriteList': favoriteList });
					}
				}
			});

			$(".notification-option-stream, .notification-selected-stream").click(async (event) => {
				const isNotify = $(event.currentTarget).hasClass("notification-selected-stream");
				const streamId = $(event.currentTarget).data("streamid");

				if (isNotify) {
					$(event.currentTarget).removeClass('notification-selected-stream');
					$(event.currentTarget).addClass('notification-option-stream');

					notifyList.remove(streamId);
					await chrome.storage.sync.set({ 'notifyList': notifyList.join(',') });
				} else {
					$(event.currentTarget).removeClass('notification-option-stream');
					$(event.currentTarget).addClass('notification-selected-stream');

					if (notifyList.length > 0 && streamId !== undefined) {
						notifyList.push(streamId);
						const notifyListFormatted = notifyList.join(',');
						await chrome.storage.sync.set({ 'notifyList': notifyListFormatted });
					} else {
						const notifyStreamList = [];
						notifyStreamList.push(streamId);
						notifyList = notifyStreamList.join(',');
						await chrome.storage.sync.set({ 'notifyList': notifyList });
					}
				}
			});
			
			if (returnedData.Cursor != null) {
				cursor = returnedData.Cursor;

				const onScrollToBottom = followingList.find('.more-section')[0];
				const onIntersection = async ([{isIntersecting}]) => {
					if (isIntersecting) {
						const fetchPromise = await fetch(`${ghostirCore}/Twitch/GetFollowedStreamList?authToken=${accessToken}&returnAmount=${followedStreamReturnAmount}&favoriteList=${favoriteList.join(',')}&parameterList={"userId":"${userId}", "cursor":"${cursor}"}`);
						const returnedData = await fetchPromise.json();

						if(returnedData.Count > 0) {
							followingList.find('.list-group').append(returnedData.ReturnHtml);
							cursor = returnedData.Cursor;

							if(cursor == null){
								followingList.find('.more-section').remove();
							}
						} else {
							followingList.find('.more-section').remove();
						}
					}
				}

				const io = new IntersectionObserver(onIntersection, {threshold: 1})
				io.observe(onScrollToBottom)
			}
		},
		error: function() {
			return false;
		}
	});
}

async function getTopGameList() {
	let cursor = null;

	const placeHolderWrapper = $("#topGameListPlaceholder_Wrapper");
	const topGameList = $("#topGameList_Wrapper");
	const topGameStreamList = $("#topGameStreamList_Wrapper");
	const fetchPromise = await fetch(`${ghostirCore}/Twitch/GetTopGameList?authToken=${accessToken}&returnAmount=${topStreamsReturnAmount}`);
	const returnedData = await fetchPromise.json();

	topGameList.html(returnedData.ReturnHtml);
	placeHolderWrapper.hide();
	topGameList.show();

	const gameButton = $('.gameButton');
	const backGames = $('#backGames');

	gameButton.on('click', async (event) => {
		let gameId = $(event.currentTarget).data('gameid');

		const fetchPromise = await fetch(`${ghostirCore}/Twitch/GetTopStreamList?authToken=${accessToken}&returnAmount=${topStreamsReturnAmount}&parameterList={"game":"${gameId}"}`);
		const returnedData = await fetchPromise.json();

		topGameStreamList.html(returnedData.ReturnHtml);

		backGames.on('click', () => {
			$('.tab-content').scrollTop(0);
			topGameStreamList.scrollTop(0);

			backGames.hide();
			topGameList.show();
			topGameStreamList.hide();
			topGameStreamList.html("");
		});

		backGames.show();
		topGameList.hide();
		topGameStreamList.show();
	});
	
	if (returnedData.Cursor != null) {
		cursor = returnedData.Cursor;

		const onScrollToBottom = topGameList.find('.more-section')[0];
		const onIntersection = async ([{isIntersecting}]) => {
			if (isIntersecting) {
				const fetchPromise = await fetch(`${ghostirCore}/Twitch/GetTopGameList?authToken=${accessToken}&returnAmount=${topStreamsReturnAmount}&cursor=${cursor}`);
				const returnedData = await fetchPromise.json();

				if(returnedData.Count > 0) {
					topGameList.find('.list-group').append(returnedData.ReturnHtml);
					cursor = returnedData.Cursor;

					if(cursor == null){
						topGameList.find('.more-section').remove();
					}
				} else {
					topGameList.find('.more-section').remove();
				}
			}
		}

		const io = new IntersectionObserver(onIntersection, {threshold: 1})
		io.observe(onScrollToBottom)
	}
}

async function getTopStreamList() {
	let cursor = null;

	const placeHolderWrapper = $("#topStreamListPlaceholder_Wrapper");
	const topStreamList = $("#topStreamList_Wrapper");
	const fetchPromise = await fetch(`${ghostirCore}/Twitch/GetTopStreamList?authToken=${accessToken}&returnAmount=${topStreamsReturnAmount}&notifyList=${notifyList.join(',')}`);
	const returnedData = await fetchPromise.json();

	topStreamList.html(returnedData.ReturnHtml);
	placeHolderWrapper.hide();
	topStreamList.show();

	if (returnedData.Cursor != null) {
		cursor = returnedData.Cursor;

		const onScrollToBottom = topStreamList.find('.more-section')[0];
		const onIntersection = async ([{isIntersecting}]) => {
			if (isIntersecting) {
				const fetchPromise = await fetch(`${ghostirCore}/Twitch/GetTopStreamList?authToken=${accessToken}&returnAmount=${topStreamsReturnAmount}&notifyList=${notifyList.join(',')}&parameterList={"cursor":"${cursor}"}`);
				const returnedData = await fetchPromise.json();

				if(returnedData.Count > 0) {
					topStreamList.find('.list-group').append(returnedData.ReturnHtml);
					cursor = returnedData.Cursor;

					if(cursor == null){
						topStreamList.find('.more-section').remove();
					}
				} else {
					topStreamList.find('.more-section').remove();
				}
			}
		}

		const io = new IntersectionObserver(onIntersection, {threshold: 1})
		io.observe(onScrollToBottom)
	}
}

async function getSearchList() {
	const searchInput = $('#searchTab');

	let typingTimer;
	const doneTypingInterval = 1000;

	searchInput.on('keyup', function () {
		const currentTab = $(".section-button.active")[0];
		const tabCode = $(currentTab).data('section-code');

		const currentPane = $('#searchResult_Wrapper .tab-pane.active')[0];
		const paneCode = $(currentPane).data('type');
		
		if (tabCode === 'Search') {
			clearTimeout(typingTimer);
			typingTimer = setTimeout(async function() {
				let filter = searchInput.val().toUpperCase();

				switch (paneCode) {
					case 'Stream':
						$('#searchStreamResult_Wrapper').html('<div class="text-center p-3"><h1 class="fw-light"><i class="fas fa-circle-notch fa-spin" style="color: #772ce8;font-size: 40px;"></i></h1></div>');
						
						if(filter.length === 0) {
							$('#searchStreamResult_Wrapper').html('<div class="text-center p-3"><small><i>Begin Searching for Stream or Games/Categories...</i></small></div>');
						} else {
							const fetchPromise = await fetch(`${ghostirCore}/Twitch/GetSearchList?authToken=${accessToken}&searchType=${paneCode}&parameterList={"search":"${filter}"}`);
							const returnedData = await fetchPromise.json();
							$('#searchStreamResult_Wrapper').html(returnedData.ReturnHtml);
						}
						break;
					case 'Category':
						$('#searchCategoryResult_Wrapper').html('<div class="text-center p-3"><h1 class="fw-light"><i class="fas fa-circle-notch fa-spin" style="color: #772ce8;font-size: 40px;"></i></h1></div>');
						
						if(filter.length === 0) {
							$('#searchCategoryResult_Wrapper').html('<div class="text-center p-3"><small><i>Begin Searching for Stream or Games/Categories...</i></small></div>');
						} else {
							const fetchPromise = await fetch(`${ghostirCore}/Twitch/GetSearchList?authToken=${accessToken}&searchType=${paneCode}&parameterList={"search":"${filter}"}`);
							const returnedData = await fetchPromise.json();
							$('#searchCategoryResult_Wrapper').html(returnedData.ReturnHtml);
						}
						break;
				}
				
				
			}, doneTypingInterval);
		}
	});

	searchInput.on('keydown', function () {
		clearTimeout(typingTimer);
	});
}

function initTabSearch() {
	const selectElement = $('#searchTab');
	selectElement.on('keyup', () => {
		let filter, li, a, i, txtValue;
		filter = selectElement.val().toUpperCase();

		const currentTab = $(".tab-pane.active")[0];

		li = $(currentTab).find('.tab-body .list-group-item');
		for (i = 0; i < li.length; i++) {
			const currentListItem = li[i];
			a = $(currentListItem).find(".fw-bold")[0];
			txtValue = a.textContent || a.innerText;

			if (txtValue.toUpperCase().indexOf(filter) > -1) {
				$(currentListItem).show();
			} else {
				$(currentListItem).hide();
			}
		}

		let countVisible = 0;
		i = 0;
		const max = li.length;
		for (; i < max; i++) {
			if (!isHidden(li[i]))
			{
				countVisible++;
			}
		}

		if($(currentTab).find('.more-section')) {
			if (countVisible <= 6) {
				$(currentTab).find('.more-section').removeClass("d-block");
				$(currentTab).find('.more-section').addClass("d-none");
			} else {
				$(currentTab).find('.more-section').removeClass("d-none");
				$(currentTab).find('.more-section').addClass("d-block");
			}
		}
	});
}

async function initRefresh() {
	$('#refresh').on('click', async () => {
		const currentTab = $(".section-button.active")[0];
		const tabCode = $(currentTab).data('section-code');

		switch (tabCode) {
			case 'FollowingStreams':
				$("#followingListPlaceholder_Wrapper").show();
				$("#followingList_Wrapper").hide();
				await getFollowingList();
				break;
			case 'TopGames':
				$("#topGameListPlaceholder_Wrapper").show();
				$("#topGameList_Wrapper").hide();
				await getTopGameList();
				break;
			case 'TopStreams':
				$("#topStreamListPlaceholder_Wrapper").show();
				$("#topStreamList_Wrapper").hide();
				await getTopStreamList();
				break;
		}
	});
}


// Useful Functions
function isHidden(el) {
	const style = window.getComputedStyle(el);
	return ((style.display === 'none') || (style.visibility === 'hidden'))
}

// Used to remove Items from an Array
Array.prototype.remove = function(x) {
	let i;
	for(i in this){
		if(this[i].toString() === x.toString()){
			this.splice(i,1)
		}
	}
}