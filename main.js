const usingFirefox = typeof window.browser !== 'undefined';
const browserType = usingFirefox ? 'Firefox' : 'Chrome';
const browser = usingFirefox ? window.browser : window.chrome;

let userId = null;
let accessToken = null;
let clientId = null;
let twitchEndpoint = null;

let userSignedIn = false;
let validationInterval = null;

//let ghostirCore = 'https://core.ghostir.net'
let ghostirCore = 'https://localhost:7094'

let notificationFavoritePosition = 'Left';
let favoriteList = [];
let notifyList = [];

let followedStreamReturnAmount = 100;
let topGamesReturnAmount = 100;
let topStreamsReturnAmount = 100;

browser.storage.sync.get('userSignedIn', async function(result) {
	userSignedIn = result?.userSignedIn
	
	const validationResponse = await validationInformation();
	if (validationResponse) {
		if (userSignedIn) {
			browser.storage.sync.get('accessToken', async function (result) {
				accessToken = result?.accessToken;
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
	let result;
	try {
		await $.ajax({
			type: "GET",
			url: `${ghostirCore}/Twitch/GetValidationInformation?browserType=${browserType}`,
			success: async function(response){
				const returnedData = JSON.parse(response);
				twitchEndpoint = returnedData.TwitchEndpoint;
				clientId = encodeURIComponent(returnedData.TwitchId);
				
				result = true;
			}
		});
	} catch (error) {
		result = false;
	}
	
	return result;
}

async function initApplication() {
	$("#defaultWrapper").hide();
	$("#loginWrapper").hide();
	$("#applicationWrapper").show();

	await this.initializeSettings();
	await this.initializeSettingsChange();

	$('.ghostir-side-navigation-item').on('shown.bs.tab', async () => {
		await this.initializeSettings();

		$("#followingList_Wrapper").hide();
		$("#topGameList_Wrapper").hide();
		$("#topGameStreamList_Wrapper").hide();
		$("#topStreamList_Wrapper").hide();
		
		$('#backGames').hide();
		const refreshButton = $('#refresh');
		const currentTab = $(".section-button.active")[0];
		const tabCode = $(currentTab).data('section-code');
		refreshButton.hide();
		
		switch (tabCode) {
			case 'FollowingStreams':
				$("#followingListPlaceholder_Wrapper").show();
				refreshButton.show();
				await getFollowingList();
				break;
			case 'TopGames':
				$("#topGameListPlaceholder_Wrapper").show();
				refreshButton.show();
				await getTopGameList();
				break;
			case 'TopStreams':
				$("#topStreamListPlaceholder_Wrapper").show();
				refreshButton.show();
				await getTopStreamList();
				break;
			case 'Settings':
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
	await browser.storage.sync.set({ 'accessToken': null });
	await browser.storage.sync.set({ 'userSignedIn': false });

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
		browser.storage.sync.set({ 'accessToken': null });
		browser.storage.sync.set({ 'userSignedIn': false });

		accessToken = null;
		userSignedIn = false;
	});
}

async function signIn() {
	if (userSignedIn) {
		$('#signIn_Icon').attr("class", "fa fa-check-circle");
	} else {
		browser.identity.launchWebAuthFlow({
			url: twitchEndpoint,
			interactive: true
		}, async function (redirect_url) {
			if (browser.runtime.lastError) {
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
						await browser.storage.sync.set({ 'accessToken': accessToken });
						await browser.storage.sync.set({ 'userSignedIn': userSignedIn });

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
	await initFollowingListButton();
	await getTopGameList();
	await initTopGameListButton();
	await getTopStreamList();
	await getSearchList();

	await initTabSearch();
	await initRefresh();
}

async function initializeSettings() {
	return new Promise((resolve) => {
		browser.storage.sync.get(['darkMode', 'notificationFavoritePosition', 'favoriteList', 'notifyList', 'followedStreamReturnAmount', 'topGamesReturnAmount', 'topStreamsReturnAmount'], function (result) {
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

			if(result.notificationFavoritePosition !== undefined) {
				notificationFavoritePosition = result.notificationFavoritePosition;
				$('#notificationFavoritePosition_Select').val(notificationFavoritePosition);
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
		browser.storage.sync.set({ 'darkMode': darkMode });
		if(darkMode) {
			$('#styleTheme').attr('href','./css/themes/dark.css');
		} else {
			$('#styleTheme').attr('href','./css/themes/light.css');
		}
	});

	$('#notificationFavoritePosition_Select').on('change', () => {
		const notificationFavoritePosition = $('#notificationFavoritePosition_Select').val();
		browser.storage.sync.set({ 'notificationFavoritePosition': notificationFavoritePosition });
	});

	$('#followedStreamReturnAmount_Input').on('change', () => {
		const followedStreamReturnAmount = $('#followedStreamReturnAmount_Input').val();
		browser.storage.sync.set({ 'followedStreamReturnAmount': followedStreamReturnAmount });
	});

	$('#topGamesReturnAmount_Input').on('change', () => {
		const topGamesReturnAmount = $('#topGamesReturnAmount_Input').val();
		browser.storage.sync.set({ 'topGamesReturnAmount': topGamesReturnAmount });
	});

	$('#topStreamsReturnAmount_Input').on('change', () => {
		const topStreamsReturnAmount = $('#topStreamsReturnAmount_Input').val();
		browser.storage.sync.set({ 'topStreamsReturnAmount': topStreamsReturnAmount });
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
		url: `${ghostirCore}/Twitch/GetFollowingStreamList?authToken=${accessToken}&browserType=${browserType}&notificationFavoritePosition=${notificationFavoritePosition}&returnAmount=${followedStreamReturnAmount}&favoriteList=${favoriteList.join(',')}&notifyList=${notifyList.join(',')}&userId=${userId}`,
		success: async function(response){
			const returnedData = JSON.parse(response);

			followingList.html(returnedData.ReturnHtml);
			placeHolderWrapper.hide();
			followingList.show();
			
			if (returnedData.Cursor != null) {
				cursor = returnedData.Cursor;
				
				const loadMoreButton = $('#followingListLoadMore_Button');
				const loadMoreWrapper = $('#followingListLoadMore_Wrapper');
				
				loadMoreButton.click(async () => {
					const fetchPromise = await fetch(`${ghostirCore}/Twitch/GetFollowingStreamList?authToken=${accessToken}&browserType=${browserType}&notificationFavoritePosition=${notificationFavoritePosition}&returnAmount=${followedStreamReturnAmount}&favoriteList=${favoriteList.join(',')}&userId=${userId}&cursor=${cursor}`);
					const returnedData = await fetchPromise.json();

					if(returnedData.Count > 0) {
						followingList.find('#followingList').append(returnedData.ReturnHtml);

						// Moving the Favorited Stream(s) to the Top of the List
						const favoritedStreamList = followingList.find('.favorited-stream').parent().parent().parent();
						followingList.find('#followingList').prepend(favoritedStreamList)
						
						cursor = returnedData.Cursor;

						if(cursor == null){
							loadMoreWrapper.remove();
						}
					} else {
						loadMoreWrapper.remove();
					}
				});
			}
		},
		error: function() {
			return false;
		}
	});
}

async function initFollowingListButton() {
	$(document.body).on('click', '.favorite-stream',async (event) => {
		const streamId = $(event.currentTarget).data("streamid");

		$(event.currentTarget).removeClass('favorite-stream');
		$(event.currentTarget).addClass('favorited-stream');

		if (favoriteList.length > 0 && streamId !== undefined) {
			favoriteList.push(streamId);
			const favoriteListFormatted = favoriteList.join(',');
			await browser.storage.sync.set({ 'favoriteList': favoriteListFormatted });
		} else {
			const favoriteStreamList = [];
			favoriteStreamList.push(streamId);
			favoriteList = favoriteStreamList.join(',');
			await browser.storage.sync.set({ 'favoriteList': favoriteList });
		}
	});

	$(document.body).on('click', '.favorited-stream',async (event) => {
		const streamId = $(event.currentTarget).data("streamid");
		$(event.currentTarget).removeClass('favorited-stream');
		$(event.currentTarget).addClass('favorite-stream');

		favoriteList.remove(streamId);
		await browser.storage.sync.set({ 'favoriteList': favoriteList.join(',') });
	});

	$(document.body).on('click', '.notification-option-stream', async (event) => {
		const streamId = $(event.currentTarget).data("streamid");
		
		$(event.currentTarget).removeClass('notification-option-stream');
		$(event.currentTarget).addClass('notification-selected-stream');

		if (notifyList.length > 0 && streamId !== undefined) {
			notifyList.push(streamId);
			const notifyListFormatted = notifyList.join(',');
			await browser.storage.sync.set({ 'notifyList': notifyListFormatted });
		} else {
			const notifyStreamList = [];
			notifyStreamList.push(streamId);
			notifyList = notifyStreamList.join(',');
			await browser.storage.sync.set({ 'notifyList': notifyList });
		}
	});

	$(document.body).on('click', '.notification-selected-stream', async (event) => {
		const streamId = $(event.currentTarget).data("streamid");

		$(event.currentTarget).removeClass('notification-selected-stream');
		$(event.currentTarget).addClass('notification-option-stream');

		notifyList.remove(streamId);
		await browser.storage.sync.set({ 'notifyList': notifyList.join(',') });
	});
}

async function getTopGameList() {
	let cursor = null;

	const placeHolderWrapper = $("#topGameListPlaceholder_Wrapper");
	const topGameList = $("#topGameList_Wrapper");
	
	const fetchPromise = await fetch(`${ghostirCore}/Twitch/GetTopGameList?authToken=${accessToken}&browserType=${browserType}&returnAmount=${topStreamsReturnAmount}`);
	const returnedData = await fetchPromise.json();

	topGameList.html(returnedData.ReturnHtml);
	placeHolderWrapper.hide();
	topGameList.show();

	if (returnedData.Cursor != null) {
		cursor = returnedData.Cursor;

		const loadMoreButton = $('#topGameListLoadMore_Button');
		const loadMoreWrapper = $('#topGameListLoadMore_Wrapper');

		loadMoreButton.click(async () => {
			const fetchPromise = await fetch(`${ghostirCore}/Twitch/GetTopGameList?authToken=${accessToken}&browserType=${browserType}&returnAmount=${topStreamsReturnAmount}&cursor=${cursor}`);
			const returnedData = await fetchPromise.json();

			if(returnedData.Count > 0) {
				topGameList.find('#topGameList').append(returnedData.ReturnHtml);
				
				cursor = returnedData.Cursor;

				if(cursor == null){
					loadMoreWrapper.remove();
				}
			} else {
				loadMoreWrapper.remove();
			}
		});
	}
}

async function initTopGameListButton() {
	const topGameList = $("#topGameList_Wrapper");
	const topGameStreamList = $("#topGameStreamList_Wrapper");
	const backGames = $('#backGames');

	$(document.body).on('click', '.gameButton', async (event) => {
		let gameId = $(event.currentTarget).data('gameid');

		const fetchPromise = await fetch(`${ghostirCore}/Twitch/GetTopGameStreamList?authToken=${accessToken}&browserType=${browserType}&notificationFavoritePosition=${notificationFavoritePosition}&notifyList=${notifyList.join(',')}&gameId=${gameId}`);
		const returnedData = await fetchPromise.json();

		topGameStreamList.html(returnedData.ReturnHtml);

		if (returnedData.Cursor != null) {
			cursor = returnedData.Cursor;

			const loadMoreButton = $('#topGameStreamListLoadMore_Button');
			const loadMoreWrapper = $('#topGameStreamListLoadMore_Wrapper');

			loadMoreButton.click(async () => {
				const fetchPromise = await fetch(`${ghostirCore}/Twitch/GetTopGameStreamList?authToken=${accessToken}&browserType=${browserType}&notificationFavoritePosition=${notificationFavoritePosition}&notifyList=${notifyList.join(',')}&gameId=${gameId}&cursor=${cursor}`);
				const returnedData = await fetchPromise.json();

				if(returnedData.Count > 0) {
					topGameStreamList.find('#topGameStreamList').append(returnedData.ReturnHtml);

					cursor = returnedData.Cursor;

					if(cursor == null){
						loadMoreWrapper.remove();
					}
				} else {
					loadMoreWrapper.remove();
				}
			});
		}

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
		$('.tab-content').scrollTop(0);
	});
}

async function getTopStreamList() {
	let cursor = null;

	const placeHolderWrapper = $("#topStreamListPlaceholder_Wrapper");
	const topStreamList = $("#topStreamList_Wrapper");
	const fetchPromise = await fetch(`${ghostirCore}/Twitch/GetTopStreamList?authToken=${accessToken}&browserType=${browserType}&notificationFavoritePosition=${notificationFavoritePosition}&returnAmount=${topStreamsReturnAmount}&notifyList=${notifyList.join(',')}`);
	const returnedData = await fetchPromise.json();

	topStreamList.html(returnedData.ReturnHtml);
	placeHolderWrapper.hide();
	topStreamList.show();

	if (returnedData.Cursor != null) {
		cursor = returnedData.Cursor;

		const loadMoreButton = $('#topStreamListLoadMore_Button');
		const loadMoreWrapper = $('#topStreamListLoadMore_Wrapper');

		loadMoreButton.click(async () => {
			const fetchPromise = await fetch(`${ghostirCore}/Twitch/GetTopStreamList?authToken=${accessToken}&browserType=${browserType}&notificationFavoritePosition=${notificationFavoritePosition}&returnAmount=${topStreamsReturnAmount}&notifyList=${notifyList.join(',')}&cursor=${cursor}`);
			const returnedData = await fetchPromise.json();

			if(returnedData.Count > 0) {
				topStreamList.find('#topStreamList').append(returnedData.ReturnHtml);

				cursor = returnedData.Cursor;

				if(cursor == null){
					loadMoreWrapper.remove();
				}
			} else {
				loadMoreWrapper.remove();
			}
		});
	}
}

async function getSearchList() {
	const searchInput = $('#searchTab');
	const searchStreamResult = $('#searchStreamResult_Wrapper');
	const searchStreamResultPlaceholder = $('#searchStreamResultPlaceholder_Wrapper');

	const searchCategoryResult = $('#searchCategoryResult_Wrapper');
	const searchCategoryResultPlaceholder = $('#searchCategoryResultPlaceholder_Wrapper');

	$('.ghostir-search-navigation-item').on('shown.bs.tab', async () => {
		const currentPane = $("#searchResult_Wrapper .tab-pane.active")[0];
		const paneCode = $(currentPane).data('type');

		switch (paneCode) {
			case 'Stream':
				if (searchInput.val().length === 0) {
					searchStreamResult.html('<div class="text-center p-3"><small><i>Search for your Favorite Streamer...</i></small></div>');
				} else {
					searchStreamResult.hide();
					searchStreamResultPlaceholder.show();

					let filter = searchInput.val().toUpperCase();
					const fetchPromise = await fetch(`${ghostirCore}/Twitch/GetSearchList?authToken=${accessToken}&browserType=${browserType}&searchType=${paneCode}&parameterList={"search":"${filter}"}`);
					const returnedData = await fetchPromise.json();
					searchStreamResult.html(returnedData.ReturnHtml);
					searchStreamResult.show();
					searchStreamResultPlaceholder.hide();
				}
				break;
			case 'Category':
				if (searchInput.val().length === 0) {
					searchCategoryResult.html('<div class="text-center p-3"><small><i>Search for your Favorite Game/Category...</i></small></div>');
				} else {
					searchCategoryResult.hide();
					searchCategoryResultPlaceholder.show();

					let filter = searchInput.val().toUpperCase();
					const fetchPromise = await fetch(`${ghostirCore}/Twitch/GetSearchList?authToken=${accessToken}&browserType=${browserType}&searchType=${paneCode}&parameterList={"search":"${filter}"}`);
					const returnedData = await fetchPromise.json();
					searchCategoryResult.html(returnedData.ReturnHtml);
					searchCategoryResult.show();
					searchCategoryResultPlaceholder.hide();
				}
				break;
		}
	});
	
	if (searchInput.val().length === 0) {
		searchStreamResult.html('<div class="text-center p-3"><small><i>Search for your Favorite Streamer...</i></small></div>');
	}

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
						if(filter.length === 0) {
							searchStreamResult.html('<div class="text-center p-3"><small><i>Search for your Favorite Stream...</i></small></div>');
						} else {
							searchStreamResult.hide();
							searchStreamResultPlaceholder.show();
							
							const fetchPromise = await fetch(`${ghostirCore}/Twitch/GetSearchList?authToken=${accessToken}&browserType=${browserType}&searchType=${paneCode}&parameterList={"search":"${filter}"}`);
							const returnedData = await fetchPromise.json();
							searchStreamResult.html(returnedData.ReturnHtml);
							searchStreamResult.show();
							searchStreamResultPlaceholder.hide();
						}
						break;
					case 'Category':
						if(filter.length === 0) {
							searchCategoryResult.html('<div class="text-center p-3"><small><i>Search for your Favorite Game/Category...</i></small></div>');
						} else {
							searchCategoryResult.hide();
							searchCategoryResultPlaceholder.show();
							
							const fetchPromise = await fetch(`${ghostirCore}/Twitch/GetSearchList?authToken=${accessToken}&browserType=${browserType}&searchType=${paneCode}&parameterList={"search":"${filter}"}`);
							const returnedData = await fetchPromise.json();
							searchCategoryResult.html(returnedData.ReturnHtml);
							searchCategoryResult.show();
							searchCategoryResultPlaceholder.hide();
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

async function initTabSearch() {
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
		
		if (selectElement.val().length > 0) {
			$(currentTab).find('.more-section').removeClass("d-block");
			$(currentTab).find('.more-section').addClass("d-none");
		} else {
			$(currentTab).find('.more-section').removeClass("d-none");
			$(currentTab).find('.more-section').addClass("d-block");
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
				$('#backGames').hide();
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

		$('.tab-content').scrollTop(0);
	});
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