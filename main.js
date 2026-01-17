const usingFirefox = typeof window.browser !== 'undefined';
const browserType = usingFirefox ? 'Firefox' : 'Chrome';
const browser = usingFirefox ? window.browser : window.chrome;

let userId = null;
let accessToken = null;
let clientId = null;
let userProfileImage = null;
let twitchEndpoint = null;

let userSignedIn = false;
let validationInterval = null;

let ghostirCore = 'http://localhost:5191'

let dismissedDonation = false;
let showOfflineFollowing = false;
let showFavoriteDivider = false;
let notificationFavoritePosition = 'Left'; 
let favoriteList = [];
let notifyList = [];
let followedCategories = [];
let categoryNotifyList = [];
let channelSections = [];

let followedStreamReturnAmount = 100;
let topGamesReturnAmount = 100;
let topStreamsReturnAmount = 100;

browser.runtime.onUpdateAvailable.addListener(() => {
	browser.runtime.reload();
});

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
			url: `${ghostirCore}/Twitch/API/GetValidationInformation?browserType=${browserType}`,
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

async function loadCachedContentForTab(tabCode) {
	const tabMap = {
		'FollowingStreams': {
			wrapper: '#followingList_Wrapper',
			placeholder: '#followingListPlaceholder_Wrapper',
			cacheKey: 'cachedFollowingList',
			initFn: () => {
				initSectionControls();
				// Initialize image loading for cached content
				requestAnimationFrame(() => {
					initImageLoading();
					// Immediate check for already-loaded cached images
					$('#followingList_Wrapper').find('.stream-item-preview img').each(function() {
						if (this.complete && this.naturalHeight > 0 && !$(this).hasClass('loaded')) {
							$(this).addClass('loaded');
							$(this).closest('.stream-item-preview').addClass('image-loaded');
						}
					});
				});
			}
		},
		'TopGames': {
			wrapper: '#topGameList_Wrapper',
			placeholder: '#topGameListPlaceholder_Wrapper',
			cacheKey: 'cachedTopGameList',
			initFn: () => {
				addCategoryActionButtons();
				organizeGameListByFavorites();
				initTopGameListButton();
			}
		},
		'TopStreams': {
			wrapper: '#topStreamList_Wrapper',
			placeholder: '#topStreamListPlaceholder_Wrapper',
			cacheKey: 'cachedTopStreamList',
			initFn: () => {}
		}
	};
	
	const tabInfo = tabMap[tabCode];
	if (!tabInfo) return false;
	
		const cachedData = await browser.storage.local.get([tabInfo.cacheKey]);
		if (cachedData[tabInfo.cacheKey]) {
			const $wrapper = $(tabInfo.wrapper);
			const $placeholder = $(tabInfo.placeholder);
			
			$wrapper.html(cachedData[tabInfo.cacheKey]);
			
			// For FollowingStreams, apply correct collapsed/expanded state immediately
			if (tabCode === 'FollowingStreams') {
				// Apply correct collapsed/expanded state from channelSections immediately
				// Do this synchronously before showing wrapper to prevent layout shift
				channelSections.forEach(section => {
					const sectionElement = $wrapper.find(`.channel-section[data-section-id="${section.id}"]`);
					if (sectionElement.length) {
						const sectionContent = sectionElement.find('.channel-section-content');
						const collapseIcon = sectionElement.find('.section-collapse-icon');
						
						if (section.collapsed) {
							sectionElement.addClass('collapsed');
							sectionContent.hide().css('display', 'none');
							collapseIcon.removeClass('ti-chevron-down').addClass('ti-chevron-right');
						} else {
							sectionElement.removeClass('collapsed');
							// Explicitly show with CSS to ensure it's visible
							sectionContent.css({'display': 'block', 'visibility': 'visible', 'opacity': '1'}).show();
							collapseIcon.removeClass('ti-chevron-right').addClass('ti-chevron-down');
						}
					}
				});
			}
			
			tabInfo.initFn();
			$placeholder.hide();
			$wrapper.show();
		
		// Restore scroll position
		const scrollPositions = await getScrollPositions();
		if (scrollPositions[tabCode]) {
			setTimeout(() => {
				const $scrollContainer = $wrapper.find('.twitch-go-stream-container, .twitch-go-category-container').first();
				if ($scrollContainer.length) {
					$scrollContainer.scrollTop(scrollPositions[tabCode]);
				}
			}, 100);
		}
		
		return true;
	}
	return false;
}

async function initApplication() {
	const sideBarButton = $('.sidebar-button');
	
	$("#defaultWrapper").hide();
	$("#loginWrapper").hide();
	$("#applicationWrapper").show();

	await this.initializeSettings();
	await this.initializeSettingsChange();
	
	// Load and restore active tab
	// First, remove any existing active states (in case HTML has defaults)
	sideBarButton.removeClass('active');
	$('.content-tab').removeClass('active');
	
	// Hide all content wrappers
	$("#followingList_Wrapper").hide();
	$("#topGameList_Wrapper").hide();
	$("#topGameStreamList_Wrapper").hide();
	$("#topStreamList_Wrapper").hide();
	
	const activeTabCode = await getActiveTab();
	const $activeTabButton = $(`.sidebar-button[data-section-code="${activeTabCode}"]`);
	if ($activeTabButton.length) {
		$activeTabButton.addClass('active');
		const tabTarget = $activeTabButton.data('target');
		$(tabTarget).addClass('active');
	} else {
		// If the saved tab doesn't exist, default to FollowingStreams
		const $defaultButton = $(`.sidebar-button[data-section-code="FollowingStreams"]`);
		if ($defaultButton.length) {
			$defaultButton.addClass('active');
			const defaultTarget = $defaultButton.data('target');
			$(defaultTarget).addClass('active');
		}
	}

	sideBarButton.click(async (e) => {
		const currentTarget = $(e.currentTarget);
		await this.initializeSettings();
		
		// Save the Scroll Position of the Current Active Tab before switching 
		const currentActiveTabCode = $('.sidebar-button.active').data('section-code');
		if (currentActiveTabCode) {
			const currentScrollContainer = currentTarget.find('.twitch-go-stream-container, .twitch-go-category-container').first();
			if (currentScrollContainer.length) {
				await saveScrollPosition(currentActiveTabCode, currentScrollContainer.scrollTop());
			}
		}

		const refreshButton = $('#refresh');
		const tabCode = $(e.currentTarget).data('section-code');
		const tabTarget = $(e.currentTarget).data('target');
		
		const wrapperMapping = {
			'FollowingStreams': '#followingList_Wrapper',
			'TopGames': '#topGameList_Wrapper',
			'TopStreams': '#topStreamList_Wrapper',
			'Search': '#searchList_Wrapper',
			'Settings': '#settings_Wrapper'
		};
		
		const targetWrapper = wrapperMapping[tabCode];
		const currentActiveTab = $('.content-tab.active');
		const isSwitchingTabs = currentActiveTab.length === 0 || currentActiveTab[0] !== $(tabTarget)[0];
		
		// Update sidebar button active state
		sideBarButton.removeClass('active');
		currentTarget.addClass('active');
		
		// Clear search input when switching tabs
		$('#searchTab').val('');
		$('#searchClear').hide();
		
		if (isSwitchingTabs) {
			const targetTab = $(tabTarget);
			targetTab.addClass('active');
			targetTab[0].offsetHeight;
			$('.content-tab').not(targetTab).removeClass('active');
		}
		
		// Save active tab
		await saveActiveTab(tabCode);
		
		// Hide all wrappers except the target one (to prevent flash)
		$("#followingList_Wrapper, #topGameList_Wrapper, #topGameStreamList_Wrapper, #topStreamList_Wrapper, #searchList_Wrapper").each(function() {
			const wrapperId = targetWrapper ? targetWrapper.substring(1) : null;
			if (this.id !== wrapperId) {
				$(this).hide();
			}
		});
		
		// Show target wrapper immediately if it exists
		if (targetWrapper) {
			$(targetWrapper).show();
		}
		
		$('#backGames').hide();
		refreshButton.hide();
		
		refreshButton.show();
		
		// Let the get functions handle cache loading to avoid double loading and flashing
		// They will load cache if available, then refresh in background smoothly
		switch (tabCode) {
			case 'FollowingStreams':
				await getFollowingList(true); // Will load cache if available, then refresh smoothly
				break;
			case 'TopGames':
				await getTopGameList(true); // Will load cache if available, then refresh smoothly
				break;
			case 'TopStreams':
				await getTopStreamList(true); // Will load cache if available, then refresh smoothly
				break;
			case 'Settings':
				break;
		}
		
		// Restore scroll position after a brief delay to ensure content is rendered
		setTimeout(async () => {
			const scrollPositions = await getScrollPositions();
			if (scrollPositions[tabCode]) {
				const $scrollContainer = $(tabTarget).find('.twitch-go-stream-container, .twitch-go-category-container').first();
				if ($scrollContainer.length) {
					$scrollContainer.scrollTop(scrollPositions[tabCode]);
				}
			}
		}, 150);
	});
	
	// Save scroll positions periodically and on scroll (using event delegation)
	let scrollSaveTimeout;
	$(document).on('scroll', '.twitch-go-stream-container, .twitch-go-category-container', function() {
		const tabCode = $('.sidebar-button.active').data('section-code');
		if (tabCode) {
			clearTimeout(scrollSaveTimeout);
			scrollSaveTimeout = setTimeout(async () => {
				await saveScrollPosition(tabCode, $(this).scrollTop());
			}, 500); // Debounce scroll saves
		}
	});

	// Only load the active tab initially if it wasn't already loaded from cache
	// (loadCachedContentForTab returns true if cache was loaded)
	const activeTab = await getActiveTab();
	const wasCacheLoaded = await loadCachedContentForTab(activeTab);
	
	if (!wasCacheLoaded) {
		// No cache was loaded, so fetch from API
		switch (activeTab) {
			case 'FollowingStreams':
				await getFollowingList(true);
				await initFollowingListButton();
				break;
			case 'TopGames':
				await getTopGameList(true);
				await initTopGameListButton();
				break;
			case 'TopStreams':
				await getTopStreamList(true);
				break;
		}
	} else {
		// Cache was loaded, but we still need to initialize buttons for FollowingStreams
		if (activeTab === 'FollowingStreams') {
			await initFollowingListButton();
		} else if (activeTab === 'TopGames') {
			await initTopGameListButton();
		}
		// Background refresh will happen via the API calls in getFollowingList/getTopGameList/getTopStreamList
		// But we should trigger them silently
		setTimeout(async () => {
			switch (activeTab) {
				case 'FollowingStreams':
					await getFollowingList(true);
					break;
				case 'TopGames':
					await getTopGameList(true);
					break;
				case 'TopStreams':
					await getTopStreamList(true);
					break;
			}
		}, 100);
	}
	
	await mainFunction();
	
	// Initialize favorite/notification button handlers (needed for both streams and games)
	// This uses event delegation so it works for dynamically added elements
	await initFollowingListButton();
	
	// Initialize overlay scrollbars
	initOverlayScrollbars();
	initRefresh();
	
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

						fetch('https://id.twitch.tv/oauth2/userinfo', {
							headers: {
								'Authorization': 'Bearer ' + accessToken
							}
						}).then(res => {
							console.log(res);
						}).catch(err => console.log(err))

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
	// Don't load all tabs here - only load active tab in initApplication
	// Other tabs will load when clicked
	await getSearchList();
	// await getSponsorList();
}

async function initializeSettings() {
	return new Promise((resolve) => {
		browser.storage.sync.get(['dismissedDonation', 'darkMode', 'autoTheaterMode', 'showOfflineFollowing', 'showFavoriteDivider', 'notificationEnabled', 'notificationFavoritePosition', 'favoriteList', 'notifyList', 'followedCategories', 'categoryNotifyList', 'channelSections', 'followedStreamReturnAmount', 'topGamesReturnAmount', 'topStreamsReturnAmount'], function (result) {
			if(result.dismissedDonation !== undefined) {
				dismissedDonation = result.dismissedDonation;
			}
			
			const darkModeCheckbox = $('#darkMode_Checkbox');
			let darkMode = darkModeCheckbox.is(":checked");
			if(result.darkMode !== undefined) {
				darkMode = result.darkMode;
			}

			if(darkMode) {
				darkModeCheckbox.prop('checked', true);
				$('#styleTheme').attr('href','');
				// Cache theme preference in localStorage for synchronous access on next load
				try {
					localStorage.setItem('twitchGo_themeCache', 'dark');
				} catch(e) {
					// Ignore localStorage errors
				}
			} else {
				darkModeCheckbox.prop('checked', false);
				$('#styleTheme').attr('href','./css/themes/light.css');
				// Cache theme preference in localStorage for synchronous access on next load
				try {
					localStorage.setItem('twitchGo_themeCache', 'light');
				} catch(e) {
					// Ignore localStorage errors
				}
			}

			const autoTheaterModeCheckbox = $('#autoTheaterMode_Checkbox');
			let autoTheaterMode = autoTheaterModeCheckbox.is(":checked");
			if(result.autoTheaterMode !== undefined) {
				autoTheaterMode = result.autoTheaterMode;
			}

			if(autoTheaterMode) {
				autoTheaterModeCheckbox.prop('checked', true);
			} else {
				autoTheaterModeCheckbox.prop('checked', false);
			}

			const showOfflineFollowingCheckbox = $('#showOfflineFollowing_Checkbox');
			let showOfflineFollowingChecked = showOfflineFollowingCheckbox.is(":checked");
			if(result.showOfflineFollowing !== undefined) {
				showOfflineFollowingChecked = result.showOfflineFollowing;
			}

			if(showOfflineFollowingChecked) {
				showOfflineFollowingCheckbox.prop('checked', true);
				showOfflineFollowing = true;
			} else {
				showOfflineFollowingCheckbox.prop('checked', false);
				showOfflineFollowing = false;
			}

			const showFavoriteDividerCheckbox = $('#showFavoriteDivider_Checkbox');
			let showFavoriteDividerChecked = showFavoriteDividerCheckbox.is(":checked");
			if(result.showFavoriteDivider !== undefined) {
				showFavoriteDividerChecked = result.showFavoriteDivider;
			}

			if(showFavoriteDividerChecked) {
				showFavoriteDividerCheckbox.prop('checked', true);
				showFavoriteDivider = true;

				$('#followingList').addClass('show-favorite-divider');
			} else {
				showFavoriteDividerCheckbox.prop('checked', false);

				$('#followingList').removeClass('show-favorite-divider');
			}

			const notificationEnabledModeCheckbox = $('#notificationEnabled_Checkbox');
			let notificationEnabled = notificationEnabledModeCheckbox.is(":checked");
			if(result.notificationEnabled !== undefined) {
				notificationEnabled = result.notificationEnabled;
			}
			else {
				browser.storage.sync.set({ 'notificationEnabled': notificationEnabled });
			}

			if(notificationEnabled) {
				notificationEnabledModeCheckbox.prop('checked', true);
			} else {
				notificationEnabledModeCheckbox.prop('checked', false);
			}

			if(result.notificationFavoritePosition !== undefined) {
				notificationFavoritePosition = result.notificationFavoritePosition;
				if (notificationFavoritePosition === 'Left') {
					$('#notificationFavoritePosition_Select').prop('checked', false);
				} else {
					$('#notificationFavoritePosition_Select').prop('checked', true);
				}
			}
			
			if(result.favoriteList !== undefined) {
				favoriteList = result.favoriteList.split(',');
			}

			if(result.notifyList !== undefined) {
				notifyList = result.notifyList.split(',');
			}

			if(result.followedCategories !== undefined) {
				followedCategories = result.followedCategories.split(',').filter(id => id).map(id => String(id));
			}

			if(result.categoryNotifyList !== undefined) {
				categoryNotifyList = result.categoryNotifyList.split(',').filter(id => id).map(id => String(id));
			}

			if(result.channelSections !== undefined) {
				channelSections = JSON.parse(result.channelSections);
			} else {
				channelSections = [];
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
		
		// Remove any existing inline theme styles from theme-loader
		$('#twitch-go-theme-loader').remove();
		
		if(darkMode) {
			$('#styleTheme').attr('href','');
			// Cache theme preference in localStorage for synchronous access on next load
			try {
				localStorage.setItem('twitchGo_themeCache', 'dark');
			} catch(e) {
				// Ignore localStorage errors
			}
		} else {
			$('#styleTheme').attr('href','./css/themes/light.css');
			// Cache theme preference in localStorage for synchronous access on next load
			try {
				localStorage.setItem('twitchGo_themeCache', 'light');
			} catch(e) {
				// Ignore localStorage errors
			}
		}
	});

	const autoTheaterModeCheckbox = $('#autoTheaterMode_Checkbox');
	autoTheaterModeCheckbox.on('change', () => {
		const autoTheaterMode = $('#autoTheaterMode_Checkbox').is(":checked");
		browser.storage.sync.set({ 'autoTheaterMode': autoTheaterMode });
	});

	const showOfflineFollowingCheckbox = $('#showOfflineFollowing_Checkbox');
	showOfflineFollowingCheckbox.on('change', () => {
		const showOfflineFollowing = $('#showOfflineFollowing_Checkbox').is(":checked");
		browser.storage.sync.set({ 'showOfflineFollowing': showOfflineFollowing });
	});

	const showFavoriteDividerCheckbox = $('#showFavoriteDivider_Checkbox');
	showFavoriteDividerCheckbox.on('change', () => {
		const showFavoriteDivider = $('#showFavoriteDivider_Checkbox').is(":checked");
		browser.storage.sync.set({ 'showFavoriteDivider': showFavoriteDivider });
		if(showFavoriteDivider) {
			$('#followingList').addClass('show-favorite-divider');
		} else {
			$('#followingList').removeClass('show-favorite-divider');
		}
	});

	const notificationEnabledModeCheckbox = $('#notificationEnabled_Checkbox');
	notificationEnabledModeCheckbox.on('change', () => {
		const notificationEnabled = $('#notificationEnabled_Checkbox').is(":checked");
		browser.storage.sync.set({ 'notificationEnabled': notificationEnabled });
	});

	$('#notificationFavoritePosition_Select').on('change', (event) => {
		const inputChecked = $(event.currentTarget).is(':checked');
		const notificationFavoritePosition = inputChecked ? 'Right' : 'Left';
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
		userProfileImage = await returnedData.data[0].profile_image_url;
		$('#info_Tab').attr("src",userProfileImage);
		
		return await returnedData.data[0].id;
	} else {
		await signOut();
	}
}

// Section Management Functions
async function saveChannelSections() {
	await browser.storage.sync.set({ 'channelSections': JSON.stringify(channelSections) });
}

function createSection(name) {
	const sectionId = 'section_' + Date.now();
	const newSection = {
		id: sectionId,
		name: name || 'New Section',
		channelIds: [],
		collapsed: false
	};
	channelSections.push(newSection);
	saveChannelSections();
	return newSection;
}

async function deleteSection(sectionId) {
	channelSections = channelSections.filter(s => s.id !== sectionId);
	saveChannelSections();
	// Refresh in background without showing placeholder
	await getFollowingList(true);
}

async function addChannelToSection(sectionId, channelId) {
	const section = channelSections.find(s => s.id === sectionId);
	if (section && !section.channelIds.includes(channelId)) {
		// Remove channel from any other section first
		channelSections.forEach(s => {
			s.channelIds = s.channelIds.filter(id => id !== channelId);
		});
		section.channelIds.push(channelId);
		
		// Remove empty sections
		channelSections = channelSections.filter(s => s.channelIds.length > 0);
		
		saveChannelSections();
		// Refresh in background without showing placeholder
		await getFollowingList(true);
	}
}

async function removeChannelFromSection(channelId) {
	channelSections.forEach(s => {
		s.channelIds = s.channelIds.filter(id => id !== channelId);
	});
	
	// Remove empty sections
	channelSections = channelSections.filter(s => s.channelIds.length > 0);
	
	saveChannelSections();
	
	// Refresh in background without showing placeholder
	await getFollowingList(true);
}

function toggleSectionCollapse(sectionId) {
	const section = channelSections.find(s => s.id === sectionId);
	if (section) {
		section.collapsed = !section.collapsed;
		saveChannelSections();
		
		// updateSectionDisplay will auto-detect if there are more sections/items after
		updateSectionDisplay(sectionId);
	}
}

function updateSectionDisplay(sectionId, showBottomDivider = undefined) {
	const section = channelSections.find(s => s.id === sectionId);
	if (!section) return;
	
	const sectionElement = $(`.channel-section[data-section-id="${sectionId}"]`);
	const sectionContent = sectionElement.find('.channel-section-content');
	const collapseIcon = sectionElement.find('.section-collapse-icon');
	
	if (section.collapsed) {
		sectionElement.addClass('collapsed');
		sectionContent.slideUp(200);
		collapseIcon.removeClass('ti-chevron-down').addClass('ti-chevron-right');
	} else {
		sectionElement.removeClass('collapsed');
		const isVisible = sectionContent.is(':visible');
		
		if (!isVisible) {
			sectionContent.slideDown(200);
		}
		collapseIcon.removeClass('ti-chevron-right').addClass('ti-chevron-down');
	}
}

// Modal Functions
function showSectionNameModal(title, defaultValue = '', onConfirm) {
	const modal = $('#sectionNameModal');
	const input = $('#sectionNameInput');
	const titleElement = $('#sectionNameModalTitle');
	
	titleElement.text(title);
	input.val(defaultValue);
	input.focus();
	input.select();
	
	modal.fadeIn(200);
	
	// Remove previous handlers
	$('#sectionNameModalConfirm, #sectionNameModalCancel, #sectionNameModalClose').off('click');
	
	// Confirm handler
	$('#sectionNameModalConfirm').on('click', function() {
		const value = input.val().trim();
		if (value) {
			hideSectionNameModal();
			onConfirm(value);
		}
	});
	
	// Cancel/Close handlers
	$('#sectionNameModalCancel, #sectionNameModalClose').on('click', function() {
		hideSectionNameModal();
	});
	
	// Enter key handler
	input.off('keydown').on('keydown', function(e) {
		if (e.key === 'Enter') {
			$('#sectionNameModalConfirm').click();
		} else if (e.key === 'Escape') {
			hideSectionNameModal();
		}
	});
	
	// Close on overlay click
	modal.off('click').on('click', function(e) {
		if ($(e.target).hasClass('section-modal-overlay')) {
			hideSectionNameModal();
		}
	});
}

function hideSectionNameModal() {
	$('#sectionNameModal').fadeOut(200);
	$('#sectionNameInput').val('');
}

function showSectionDeleteModal(onConfirm) {
	const modal = $('#sectionDeleteModal');
	
	modal.fadeIn(200);
	
	// Remove previous handlers
	$('#sectionDeleteModalConfirm, #sectionDeleteModalCancel, #sectionDeleteModalClose').off('click');
	
	// Confirm handler
	$('#sectionDeleteModalConfirm').on('click', function() {
		hideSectionDeleteModal();
		onConfirm();
	});
	
	// Cancel/Close handlers
	$('#sectionDeleteModalCancel, #sectionDeleteModalClose').on('click', function() {
		hideSectionDeleteModal();
	});
	
	// Close on overlay click
	modal.off('click').on('click', function(e) {
		if ($(e.target).hasClass('section-modal-overlay')) {
			hideSectionDeleteModal();
		}
	});
	
	// Escape key handler
	$(document).off('keydown.sectionDeleteModal').on('keydown.sectionDeleteModal', function(e) {
		if (e.key === 'Escape') {
			hideSectionDeleteModal();
		}
	});
}

function hideSectionDeleteModal() {
	$('#sectionDeleteModal').fadeOut(200);
	$(document).off('keydown.sectionDeleteModal');
}

function getChannelIdFromStreamItem($item) {
	// Try data attribute first (this is the Twitch user ID)
	const streamId = $item.find('.favorite, .notification').first().data('streamid');
	if (streamId) return String(streamId);
	
	// Try to extract from link (fallback to username)
	const streamLink = $item.find('a[href*="twitch.tv"]').first();
	if (streamLink.length) {
		const href = streamLink.attr('href');
		const match = href.match(/twitch\.tv\/([^\/\?]+)/);
		if (match) {
			return match[1].toLowerCase();
		}
	}
	
	// Try to get from streamer name (last resort)
	const streamerName = $item.find('.streamer').text().trim().toLowerCase();
	if (streamerName) return streamerName;
	
	return null;
}

function normalizeChannelId(channelId) {
	if (!channelId) return '';
	return String(channelId).toLowerCase().trim();
}

function isItemFavorite($item) {
	// Check if the item has the favorite class selected
	if ($item.find('.favorite.selected').length > 0) {
		return true;
	}
	
	// Also check by channelId in favoriteList (normalize for comparison)
	const channelId = getChannelIdFromStreamItem($item);
	if (channelId) {
		const normalizedId = normalizeChannelId(channelId);
		// Check both normalized and original ID in favoriteList
		return favoriteList.some(id => {
			const normalizedFavoriteId = normalizeChannelId(String(id));
			return normalizedFavoriteId === normalizedId || String(id) === channelId;
		});
	}
	
	return false;
}

function createSectionHtml(section, items) {
	// Separate favorites from non-favorites within the section
	const favoriteItems = [];
	const nonFavoriteItems = [];
	
	items.forEach(item => {
		const $item = $(item);
		if (isItemFavorite($item)) {
			favoriteItems.push(item);
		} else {
			nonFavoriteItems.push(item);
		}
	});
	
	// Build HTML for items with divider if needed
	let itemsHtml = '';
	
	// Add favorite items first
	favoriteItems.forEach(item => {
		itemsHtml += item[0].outerHTML;
	});
	
	// Add divider between favorites and non-favorites if both exist and divider is enabled
	if (showFavoriteDivider && favoriteItems.length > 0 && nonFavoriteItems.length > 0) {
		itemsHtml += '<div class="favorited-divider"></div>';
	}
	
	// Add non-favorite items
	nonFavoriteItems.forEach(item => {
		itemsHtml += item[0].outerHTML;
	});
	
	const collapsedClass = section.collapsed ? 'collapsed' : '';
	const collapseIcon = section.collapsed ? 'ti-chevron-right' : 'ti-chevron-down';
	
	// Removed divider - no longer adding dividers for section groups
	const bottomDivider = '';
	
	return `
		<div class="channel-section ${collapsedClass}" data-section-id="${section.id}" draggable="true">
			<div class="channel-section-header">
				<button class="section-drag-handle" data-section-id="${section.id}" title="Drag to reorder">
					<i class="ti ti-grip-vertical"></i>
				</button>
				<button class="section-collapse-btn" data-section-id="${section.id}">
					<i class="ti ${collapseIcon} section-collapse-icon"></i>
				</button>
				<span class="section-name">${section.name}</span>
				<div class="section-actions">
					<button class="section-edit-btn" data-section-id="${section.id}" data-tippy-content="Edit Section">
						<i class="ti ti-pencil"></i>
					</button>
					<button class="section-delete-btn" data-section-id="${section.id}" data-tippy-content="Delete Section">
						<i class="ti ti-trash"></i>
					</button>
				</div>
				<span class="section-count">${items.length}</span>
			</div>
			<div class="channel-section-content" style="${section.collapsed ? 'display: none;' : ''}">
				${itemsHtml}
				${bottomDivider}
			</div>
		</div>
	`;
}

async function preloadImagesAndReplace($container, newHtml, callback) {
	// Store current images and their sources for comparison
	const currentImages = new Map();
	$container.find('.stream-item-preview img').each(function() {
		const $img = $(this);
		const src = $img.attr('src');
		if (src) {
			// Use stream ID or index as key
			const $item = $img.closest('.stream-item');
			const streamId = $item.find('.favorite, .notification').first().data('streamid');
			const key = streamId || $item.index();
			currentImages.set(key, { $img: $img.clone(), src });
		}
	});
	
	// Create a temporary container to parse the new HTML
	const $temp = $('<div>').html(newHtml);
	
	// Extract all image URLs from the new HTML
	const imageUrls = [];
	$temp.find('.stream-item-preview img').each(function() {
		const src = $(this).attr('src');
		if (src) {
			imageUrls.push(src);
		}
	});
	
	// Preload all new images
	const preloadPromises = imageUrls.map(url => {
		return new Promise((resolve) => {
			const img = new Image();
			img.onload = () => resolve({ url, success: true, img });
			img.onerror = () => resolve({ url, success: false });
			img.src = url;
			
			// Timeout after 2 seconds - if image doesn't load, proceed anyway
			setTimeout(() => resolve({ url, success: false }), 2000);
		});
	});
	
	// Wait for all images to load (or timeout)
	await Promise.all(preloadPromises);
	
	// Now replace the HTML - images are already loaded in browser cache
	$container.html(newHtml);
	
	const images = $container[0].querySelectorAll('.stream-item-preview img');
	for (let i = 0; i < images.length; i++) {
		const img = images[i];
		img.classList.add('loaded');
		const preview = img.closest('.stream-item-preview');
		if (preview) {
			preview.classList.add('image-loaded');
		}
	}
	
	// Execute callback if provided
	if (callback) {
		callback();
	}
}

async function preloadCategoryImagesAndReplace($container, newHtml, callback) {
	// Create a temporary container to parse the new HTML
	const $temp = $('<div>').html(newHtml);
	
	// Extract all image URLs from the new HTML
	const imageUrls = [];
	$temp.find('.category-preview img').each(function() {
		const src = $(this).attr('src');
		if (src) {
			imageUrls.push(src);
		}
	});
	
	// Preload all new images
	const preloadPromises = imageUrls.map(url => {
		return new Promise((resolve) => {
			const img = new Image();
			img.onload = () => resolve({ url, success: true, img });
			img.onerror = () => resolve({ url, success: false });
			img.src = url;
			
			// Timeout after 2 seconds - if image doesn't load, proceed anyway
			setTimeout(() => resolve({ url, success: false }), 2000);
		});
	});
	
	// Wait for all images to load (or timeout)
	await Promise.all(preloadPromises);
	
	// Now replace the HTML - images are already loaded in browser cache
	$container.html(newHtml);
	
	const images = $container[0].querySelectorAll('.category-preview img');
	for (let i = 0; i < images.length; i++) {
		const img = images[i];
		img.classList.add('loaded');
		const preview = img.closest('.category-preview');
		if (preview) {
			preview.classList.add('image-loaded');
		}
	}
	
	// Execute callback if provided
	if (callback) {
		callback();
	}
}

function initImageLoading() {
	const $previewImages = $('.stream-item-preview img');
	
	$previewImages.each(function() {
		const $img = $(this);
		const $preview = $img.closest('.stream-item-preview');
		const imgElement = this;
		
		// Function to mark image as loaded
		const markAsLoaded = () => {
			$img.addClass('loaded');
			$preview.addClass('image-loaded');
		};
		
		if (imgElement.complete && imgElement.naturalHeight > 0) {
			markAsLoaded();
		} else if (imgElement.complete && imgElement.naturalHeight === 0) {
			setTimeout(() => {
				if (imgElement.naturalHeight > 0 || !$img.hasClass('loaded')) {
					markAsLoaded();
				}
			}, 10);
		} else {
			$img.one('load', function() {
				markAsLoaded();
			}).one('error', function() {
				markAsLoaded();
			});
			
			setTimeout(() => {
				if (imgElement.complete && imgElement.naturalHeight > 0 && !$img.hasClass('loaded')) {
					markAsLoaded();
				}
			}, 50);
			
			setTimeout(() => {
				if (!$img.hasClass('loaded')) {
					markAsLoaded();
				}
			}, 500);
		}
	});
	
	// Handle smooth loading for game/category preview images
	const $categoryPreviews = $('.category-preview img');
	
	$categoryPreviews.each(function() {
		const $img = $(this);
		const $preview = $img.closest('.category-preview');
		const imgElement = this;
		
		// Function to mark image as loaded
		const markAsLoaded = () => {
			$img.addClass('loaded');
			$preview.addClass('image-loaded');
		};
		
		if (imgElement.complete && imgElement.naturalHeight > 0) {
			markAsLoaded();
		} else if (imgElement.complete && imgElement.naturalHeight === 0) {
			setTimeout(() => {
				if (imgElement.naturalHeight > 0 || !$img.hasClass('loaded')) {
					markAsLoaded();
				}
			}, 10);
		} else {
			$img.one('load', function() {
				markAsLoaded();
			}).one('error', function() {
				markAsLoaded();
			});
			
			setTimeout(() => {
				if (imgElement.complete && imgElement.naturalHeight > 0 && !$img.hasClass('loaded')) {
					markAsLoaded();
				}
			}, 50);
			
			setTimeout(() => {
				if (!$img.hasClass('loaded')) {
					markAsLoaded();
				}
			}, 500);
		}
	});
}

function initSectionControls() {
	initSectionDragAndDrop();
	
	$('.channel-section-header').off('click').on('click', function(e) {
		// Don't trigger if clicking on action buttons or drag handle
		if ($(e.target).closest('.section-actions').length > 0 || 
		    $(e.target).closest('.section-drag-handle').length > 0) {
			return;
		}
		
		const sectionId = $(this).closest('.channel-section').data('section-id');
		if (sectionId) {
			toggleSectionCollapse(sectionId);
		}
	});
	
	// Collapse/Expand buttons (still works but header also works)
	$('.section-collapse-btn').off('click').on('click', function(e) {
		e.stopPropagation();
		const sectionId = $(this).data('section-id');
		toggleSectionCollapse(sectionId);
	});
	
	// Delete buttons
	$('.section-delete-btn').off('click').on('click', function(e) {
		e.stopPropagation();
		const sectionId = $(this).data('section-id');
		showSectionDeleteModal(() => {
			deleteSection(sectionId);
		});
	});
	
	// Edit buttons
	$('.section-edit-btn').off('click').on('click', function(e) {
		e.stopPropagation();
		const sectionId = $(this).data('section-id');
		const section = channelSections.find(s => s.id === sectionId);
		if (section) {
			showSectionNameModal('Edit Section', section.name, async (newName) => {
				section.name = newName;
				saveChannelSections();
				// Update section name in DOM immediately
				const $sectionHeader = $(`.channel-section[data-section-id="${sectionId}"] .section-name`);
				if ($sectionHeader.length) {
					$sectionHeader.text(newName);
				}
				// Refresh in background to sync with backend
				await getFollowingList(true);
			});
		}
	});
}

function initSectionDragAndDrop() {
	let draggedSection = null;
	let dragOverSection = null;
	let currentDragOverPosition = null;
	
	// Drag start
	$('.channel-section').off('dragstart').on('dragstart', function(e) {
		draggedSection = $(this);
		// Use inline style for opacity instead of class to avoid flickering
		this.style.opacity = '0.4';
		this.style.transform = 'scale(0.98)';
		
		e.originalEvent.dataTransfer.effectAllowed = 'move';
		e.originalEvent.dataTransfer.setData('text/html', this.outerHTML);
	});
	
	// Drag end
	$('.channel-section').off('dragend').on('dragend', function(e) {
		// Reset inline styles
		this.style.opacity = '';
		this.style.transform = '';
		draggedSection = null;
		dragOverSection = null;
		currentDragOverPosition = null;
	});
	
	// Drag over - track position without adding classes
	$('.channel-section').off('dragover').on('dragover', function(e) {
		e.preventDefault();
		e.stopPropagation();
		e.originalEvent.dataTransfer.dropEffect = 'move';
		
		const targetSection = $(this);
		if (!draggedSection || targetSection[0] === draggedSection[0]) {
			return;
		}
		
		// Determine if we're in the top or bottom half of the section
		const rect = this.getBoundingClientRect();
		const mouseY = e.originalEvent.clientY;
		const sectionMiddle = rect.top + rect.height / 2;
		const isTopHalf = mouseY < sectionMiddle;
		const position = isTopHalf ? 'top' : 'bottom';
		
		// Only update if the section or position changed
		if (dragOverSection && dragOverSection[0] === targetSection[0] && currentDragOverPosition === position) {
			return;
		}
		
		// Track the current drag-over section and position (no class changes)
		dragOverSection = targetSection;
		currentDragOverPosition = position;
	});
	
	// Drag enter
	$('.channel-section').off('dragenter').on('dragenter', function(e) {
		e.preventDefault();
		e.stopPropagation();
		if (!draggedSection || $(this)[0] === draggedSection[0]) {
			return;
		}
	});
	
	// Drag leave - just clear tracking, no class changes
	$('.channel-section').off('dragleave').on('dragleave', function(e) {
		// Use relatedTarget to check if we're moving to a child element
		const relatedTarget = e.originalEvent.relatedTarget;
		const targetElement = this;
		
		// Check if relatedTarget is a child of this element
		if (relatedTarget && targetElement.contains(relatedTarget)) {
			return; // Still inside the element
		}
		
		// Only clear if this was the drag-over section
		if (dragOverSection && dragOverSection[0] === this) {
			dragOverSection = null;
			currentDragOverPosition = null;
		}
	});
	
	// Drop
	$('.channel-section').off('drop').on('drop', function(e) {
		e.preventDefault();
		e.stopPropagation();
		
		const targetSection = $(this);
		
		if (draggedSection && draggedSection[0] !== targetSection[0]) {
			// Get section IDs in current order
			const container = $('.twitch-go-stream-container');
			const allSections = container.find('.channel-section');
			const currentOrder = [];
			
			allSections.each(function() {
				const sectionId = $(this).data('section-id');
				if (sectionId) {
					currentOrder.push(sectionId);
				}
			});
			
			// Reorder the array
			const draggedId = draggedSection.data('section-id');
			const draggedArrayIndex = currentOrder.indexOf(draggedId);
			
			if (draggedArrayIndex !== -1) {
				// Remove from old position
				currentOrder.splice(draggedArrayIndex, 1);
				
				// Determine insert position based on tracked drag-over position
				const targetId = targetSection.data('section-id');
				const targetArrayIndex = currentOrder.indexOf(targetId);
				
				if (targetArrayIndex !== -1) {
					// Use the tracked position
					const insertPosition = currentDragOverPosition || 'bottom';
					
					if (insertPosition === 'top') {
						currentOrder.splice(targetArrayIndex, 0, draggedId);
					} else {
						currentOrder.splice(targetArrayIndex + 1, 0, draggedId);
					}
				} else {
					currentOrder.push(draggedId);
				}
				
				// Reorder channelSections array to match
				const reorderedSections = [];
				currentOrder.forEach(sectionId => {
					const section = channelSections.find(s => s.id === sectionId);
					if (section) {
						reorderedSections.push(section);
					}
				});
				
				// Update channelSections with new order
				channelSections = reorderedSections;
				saveChannelSections();
				
				// Refresh in background without showing placeholder
				getFollowingList(true);
			}
		}
		
		draggedSection = null;
		dragOverSection = null;
		currentDragOverPosition = null;
	});
	
	// Prevent drag handle from triggering collapse
	$('.section-drag-handle').off('click').on('click', function(e) {
		e.stopPropagation();
	});
}

async function getFollowingList(useCache = true) {
	let cursor = null;
	let offlineCursor = false;

	const placeHolderWrapper = $("#followingListPlaceholder_Wrapper");
	const followingList = $("#followingList_Wrapper");

	// Only show placeholder if there's no cache
	if (useCache && !followingList.is(':visible')) {
		const cachedData = await browser.storage.local.get(['cachedFollowingList']);
		if (cachedData.cachedFollowingList) {
			// We have cache - hide placeholder and show cached content immediately
			placeHolderWrapper.hide();
			
			followingList.html(cachedData.cachedFollowingList);
			
			channelSections.forEach(section => {
				const sectionElement = followingList.find(`.channel-section[data-section-id="${section.id}"]`);
				if (sectionElement.length) {
					const sectionContent = sectionElement.find('.channel-section-content');
					const collapseIcon = sectionElement.find('.section-collapse-icon');
					
					if (section.collapsed) {
						sectionElement.addClass('collapsed');
						sectionContent.hide().css('display', 'none');
						collapseIcon.removeClass('ti-chevron-down').addClass('ti-chevron-right');
					} else {
						sectionElement.removeClass('collapsed');
						// Explicitly show with CSS to ensure it's visible
						sectionContent.css({'display': 'block', 'visibility': 'visible', 'opacity': '1'}).show();
						collapseIcon.removeClass('ti-chevron-right').addClass('ti-chevron-down');
					}
				}
			});
			
			followingList.show();
			
			// Initialize section controls (click handlers, drag and drop, etc.)
			initSectionControls();
			
			// Initialize image loading handlers
			requestAnimationFrame(() => {
				initImageLoading();
				followingList.find('.stream-item-preview img').each(function() {
					if (this.complete && this.naturalHeight > 0 && !$(this).hasClass('loaded')) {
						$(this).addClass('loaded');
						$(this).closest('.stream-item-preview').addClass('image-loaded');
					}
				});
			});
		} else {
			// No cache exists - show placeholder while loading
			placeHolderWrapper.show();
			followingList.hide();
		}
	} else if (!useCache) {
		// Not using cache - show placeholder while loading
		placeHolderWrapper.show();
		followingList.hide();
	} else {
		// Content is already visible (background refresh) - ensure placeholder is hidden
		placeHolderWrapper.hide();
	}

	// Ensure userId is available before making API call
	if (!userId) {
		userId = await getCurrentUserId();
	}
	
	// Prepare channelSections JSON for API
	const channelSectionsJson = channelSections && channelSections.length > 0 ? JSON.stringify(channelSections) : '';
	
	return $.ajax({
		type: "GET",
		url: `${ghostirCore}/Twitch/API/GetFollowingStreamList?authToken=${accessToken}&browserType=${browserType}&showOfflineFollowing=${showOfflineFollowing}&offlineCursor=${offlineCursor}&notificationFavoritePosition=${notificationFavoritePosition}&returnAmount=${followedStreamReturnAmount}&favoriteList=${favoriteList.join(',')}&notifyList=${notifyList.join(',')}&userId=${userId}&channelSectionsJson=${encodeURIComponent(channelSectionsJson)}&showFavoriteDivider=${showFavoriteDivider}`,
		success: async function(response){
			const returnedData = JSON.parse(response);

			// Check if this is a background refresh (content already visible)
			// A background refresh means: we're using cache AND content is already visible AND has content
			// On first load with no cache: followingList is hidden or empty, so isBackgroundRefresh = false
			const hasExistingContent = followingList.is(':visible') && followingList.length > 0;
			const existingHtml = hasExistingContent ? followingList.html() : '';
			const isBackgroundRefresh = useCache && hasExistingContent && existingHtml.trim().length > 0;
			
			// For background refresh, compare HTML to avoid unnecessary replacement
			if (isBackgroundRefresh) {
				const currentHtml = followingList.html();
				const newHtml = returnedData.ReturnHtml;
				// Only replace if content actually changed
				if (currentHtml !== newHtml) {
					// Preload images before replacing to prevent visual reload
					await preloadImagesAndReplace(followingList, newHtml, () => {
						// Apply section states after replacement
						channelSections.forEach(section => {
							const sectionElement = followingList.find(`.channel-section[data-section-id="${section.id}"]`);
							if (sectionElement.length) {
								const sectionContent = sectionElement.find('.channel-section-content');
								const collapseIcon = sectionElement.find('.section-collapse-icon');
								
								if (section.collapsed) {
									sectionElement.addClass('collapsed');
									sectionContent.hide().css('display', 'none');
									collapseIcon.removeClass('ti-chevron-down').addClass('ti-chevron-right');
								} else {
									sectionElement.removeClass('collapsed');
									sectionContent.css({'display': 'block', 'visibility': 'visible', 'opacity': '1'}).show();
									collapseIcon.removeClass('ti-chevron-right').addClass('ti-chevron-down');
								}
							}
						});
						
						// Initialize section controls
						initSectionControls();
					});
					
					// Get the container to preserve scroll position
					const $container = followingList.find('.twitch-go-stream-container');
					const scrollTop = $container.length ? $container.scrollTop() : 0;
					
					// Restore scroll position after replacement
					requestAnimationFrame(() => {
						const $newContainer = followingList.find('.twitch-go-stream-container');
						if ($newContainer.length) {
							$newContainer.scrollTop(scrollTop);
						}
					});
					
					// Use requestAnimationFrame for other operations
					requestAnimationFrame(() => {
						
						// Add donation item if needed
						if(!dismissedDonation) {
							followingList.find('.twitch-go-stream-container').prepend(`
								<div class="stream-item donation ">
									<a class="stream-item-preview donation" href="https://buymeacoffee.com/ghostir" target="_blank">
										<i class="ti ti-coffee donation-heart"></i>
									</a>
									<a class="stream-item-information donation" href="https://buymeacoffee.com/ghostir" target="_blank">
										<div class="streamer">Enjoying Twitch GO?</div>
										<div class="display-flex">
											<span class="category">Consider buying me a Cup of Coffee by clicking here</span>
										</div>
									</a>
									<a class="donation-dismiss" href="#" data-tippy-content="Dismiss">
										<i class="ti ti-x"></i>
									</a>
								</div>`);
						}

					tippy('.donation-dismiss', {
						placement: 'left',
						theme: 'material'
					});

					$('.donation-dismiss').off('click').on('click', function(e) {
						e.preventDefault();
						e.stopPropagation();
						browser.storage.sync.set({ 'dismissedDonation': true });
						dismissedDonation = true;
						$(this).closest('.stream-item.donation').remove();
					});
					
					// Re-initialize section controls after replacement
					initSectionControls();
						
						// Initialize image loading handlers
						followingList.find('.stream-item-preview img').each(function() {
							const $img = $(this);
							const $preview = $img.closest('.stream-item-preview');
							
							// During background refresh, images are likely cached, mark as loaded immediately
							if (this.complete && this.naturalHeight > 0) {
								$img.addClass('loaded');
								$preview.addClass('image-loaded');
							} else {
								// Even if not complete, mark as loaded to prevent fade-in animation during refresh
								// The image will appear when it loads from cache
								$img.addClass('loaded');
								$preview.addClass('image-loaded');
							}
						});
						
						initImageLoading();
						
						requestAnimationFrame(() => {
							requestAnimationFrame(() => {
								// Remove the class that disables animations
								followingList.removeClass('no-section-animation');
								
								// Remove inline styles to restore CSS animation and transition for future updates
								followingList.find('.channel-section').each(function() {
									this.style.removeProperty('animation');
									this.style.removeProperty('transition');
								});
							});
						});
					});
					
					// Update cache
					await browser.storage.local.set({ 'cachedFollowingList': returnedData.ReturnHtml });
					return;
				} else {
					await browser.storage.local.set({ 'cachedFollowingList': returnedData.ReturnHtml });
					return;
				}
			} else {
				if (!returnedData.ReturnHtml || returnedData.ReturnHtml.trim().length === 0) {
					console.error('getFollowingList: ReturnHtml is empty or undefined');
					return;
				}
				
				placeHolderWrapper.hide();
				followingList.html(returnedData.ReturnHtml);
				
				channelSections.forEach(section => {
					const sectionElement = followingList.find(`.channel-section[data-section-id="${section.id}"]`);
					if (sectionElement.length) {
						const sectionContent = sectionElement.find('.channel-section-content');
						const collapseIcon = sectionElement.find('.section-collapse-icon');
						
						if (section.collapsed) {
							sectionElement.addClass('collapsed');
							sectionContent.hide().css('display', 'none');
							collapseIcon.removeClass('ti-chevron-down').addClass('ti-chevron-right');
						} else {
							sectionElement.removeClass('collapsed');
							// Explicitly show with CSS to ensure it's visible
							sectionContent.css({'display': 'block', 'visibility': 'visible', 'opacity': '1'}).show();
							collapseIcon.removeClass('ti-chevron-right').addClass('ti-chevron-down');
						}
					}
				});
				
				// Add donation item if needed
				if(!dismissedDonation) {
					followingList.find('.twitch-go-stream-container').prepend(`
						<div class="stream-item donation ">
							<a class="stream-item-preview donation" href="https://buymeacoffee.com/ghostir" target="_blank">
								<i class="ti ti-coffee donation-heart"></i>
							</a>
							<a class="stream-item-information donation" href="https://buymeacoffee.com/ghostir" target="_blank">
								<div class="streamer">Enjoying Twitch GO?</div>
								<div class="display-flex">
									<span class="category">Consider buying me a Cup of Coffee by clicking here</span>
								</div>
							</a>
							<a class="donation-dismiss" href="#" data-tippy-content="Dismiss">
								<i class="ti ti-x"></i>
							</a>
						</div>`);
				}

				tippy('.donation-dismiss', {
					placement: 'left',
					theme: 'material'
				});

				$('.donation-dismiss').off('click').on('click', function(e) {
					e.preventDefault();
					e.stopPropagation();
					browser.storage.sync.set({ 'dismissedDonation': true });
					dismissedDonation = true;
					$(this).closest('.stream-item.donation').remove();
				});
				
			placeHolderWrapper.hide();
			followingList.css({
				'display': 'block',
				'visibility': 'visible',
				'opacity': '1'
			}).show();
				initSectionControls();
				initImageLoading();
				
				followingList.find('.stream-item-preview img').each(function() {
					if (this.complete && this.naturalHeight > 0 && !$(this).hasClass('loaded')) {
						$(this).addClass('loaded');
						$(this).closest('.stream-item-preview').addClass('image-loaded');
					}
				});
				
				requestAnimationFrame(() => {
					followingList.find('.stream-item-preview img').each(function() {
						if (this.complete && this.naturalHeight > 0 && !$(this).hasClass('loaded')) {
							$(this).addClass('loaded');
							$(this).closest('.stream-item-preview').addClass('image-loaded');
						}
					});
				});
			}
			
			await browser.storage.local.set({ 'cachedFollowingList': returnedData.ReturnHtml });
			
			if (returnedData.Cursor != null) {
				cursor = returnedData.Cursor;
				offlineCursor = returnedData.OfflineCursor
				
				const loadMoreButton = $('#followingListLoadMore_Button');
				const loadMoreWrapper = $('#followingListLoadMore_Wrapper');
				
				loadMoreButton.click(async () => {
					const channelSectionsJsonForLoadMore = channelSections && channelSections.length > 0 ? JSON.stringify(channelSections) : '';
					const fetchPromise = await fetch(`${ghostirCore}/Twitch/API/GetFollowingStreamList?authToken=${accessToken}&browserType=${browserType}&notificationFavoritePosition=${notificationFavoritePosition}&returnAmount=${followedStreamReturnAmount}&favoriteList=${favoriteList.join(',')}&notifyList=${notifyList.join(',')}&userId=${userId}&cursor=${cursor}&showOfflineFollowing=${showOfflineFollowing}&offlineCursor=${offlineCursor}&channelSectionsJson=${encodeURIComponent(channelSectionsJsonForLoadMore)}&showFavoriteDivider=${showFavoriteDivider}`);
					const returnedData = await fetchPromise.json();

					if(returnedData.Count > 0) {
						followingList.find('.twitch-go-stream-container').append(returnedData.ReturnHtml);
						
						// Initialize section controls for newly loaded content
						initSectionControls();
						
						// Initialize image loading handlers for newly loaded images
						initImageLoading();
						
						cursor = returnedData.Cursor;
						offlineCursor = returnedData.OfflineCursor

						// Re-run search if there's a search filter active
						searchLogic();
						
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
	$(document.body).off('click', '.favorite');
	$(document.body).off('click', '.notification');
	
	$(document.body).on('click', '.favorite', async (event) => {
		event.stopPropagation();
		event.preventDefault();
		
		const streamId = $(event.currentTarget).data("streamid");
		const categoryId = $(event.currentTarget).data("categoryid");

		// Handle category favorites
		if (categoryId !== undefined && categoryId !== null && categoryId !== '') {
			// Normalize categoryId to string for consistent storage
			const categoryIdStr = String(categoryId);
			const $button = $(event.currentTarget);
			const $container = $button.closest('.category-action-container');
			
			if ($button.hasClass('selected')) {
				$button.removeClass('selected');
				followedCategories = followedCategories.filter(id => String(id) !== categoryIdStr);
			} else {
				$button.addClass('selected');
				if (!followedCategories.some(id => String(id) === categoryIdStr)) {
					followedCategories.push(categoryIdStr);
				}
			}
			
			// Update container visibility
			if ($container.find('.favorite.selected').length > 0 || $container.find('.notification.selected').length > 0) {
				$container.addClass('has-selected');
			} else {
				$container.removeClass('has-selected');
			}
			
			await browser.storage.sync.set({ 'followedCategories': followedCategories.join(',') });
			
			// Reorganize game list to show favorites first
			setTimeout(() => {
				organizeGameListByFavorites();
			}, 100);
			
			return;
		}

		// Handle stream favorites
		if (streamId !== undefined) {
			if ($(event.currentTarget).hasClass('selected')) {
				$(event.currentTarget).removeClass('selected');
				favoriteList = favoriteList.filter(id => id !== streamId);
			} else {
				$(event.currentTarget).addClass('selected');
				if (!favoriteList.includes(streamId)) {
					favoriteList.push(streamId);
				}
			}

			await browser.storage.sync.set({ 'favoriteList': favoriteList.join(',') });
		}
	});

	$(document.body).on('click', '.notification', async (event) => {
		event.stopPropagation();
		event.preventDefault();
		
		const streamId = $(event.currentTarget).data("streamid");
		const categoryId = $(event.currentTarget).data("categoryid");

		// Handle category notifications
		if (categoryId !== undefined && categoryId !== null && categoryId !== '') {
			// Normalize categoryId to string for consistent storage
			const categoryIdStr = String(categoryId);
			const $button = $(event.currentTarget);
			const $container = $button.closest('.category-action-container');
			
			if ($button.hasClass('selected')) {
				$button.removeClass('selected');
				categoryNotifyList = categoryNotifyList.filter(id => String(id) !== categoryIdStr);
			} else {
				$button.addClass('selected');
				if (!categoryNotifyList.some(id => String(id) === categoryIdStr)) {
					categoryNotifyList.push(categoryIdStr);
				}
			}
			
			// Update container visibility
			if ($container.find('.favorite.selected').length > 0 || $container.find('.notification.selected').length > 0) {
				$container.addClass('has-selected');
			} else {
				$container.removeClass('has-selected');
			}
			
			await browser.storage.sync.set({ 'categoryNotifyList': categoryNotifyList.join(',') });
			return;
		}

		// Handle stream notifications
		if (streamId !== undefined) {
			if ($(event.currentTarget).hasClass('selected')) {
				$(event.currentTarget).removeClass('selected');
				notifyList = notifyList.filter(id => id !== streamId);
			} else {
				$(event.currentTarget).addClass('selected');
				if (!notifyList.includes(streamId)) {
					notifyList.push(streamId);
				}
			}
			
			await browser.storage.sync.set({ 'notifyList': notifyList.join(',') });
		}
	});
	
	$(document.body).off('click', '.stream-settings-btn');
	$(document.body).on('click', '.stream-settings-btn', function(e) {
		e.stopPropagation();
		e.preventDefault();
		const $btn = $(this);
		const $item = $btn.closest('.stream-item');
		const channelId = getChannelIdFromStreamItem($item);
		if (!channelId) {
			console.warn('Dropdown: No channelId found for stream item');
			return;
		}
		
		// Get or create button ID
		let buttonId = $btn.attr('data-button-id');
		if (!buttonId) {
			buttonId = 'btn-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
			$btn.attr('data-button-id', buttonId);
		}
		
		// Check if dropdown is already open for this button
		const existingMenu = $('.section-dropdown-menu[data-button-id="' + buttonId + '"]');
		const isOpen = existingMenu.length > 0;
		
		// If it was already open, just close it (toggle off)
		if (isOpen) {
			existingMenu.remove();
			return;
		}
		
		// Close any other open dropdowns
		$('.section-dropdown-menu').remove();
		
		// Find current section
		const currentSection = channelSections.find(s => s.channelIds.includes(channelId));
		
		// Get button's bounding rect for boundary checks
		const btnRect = $btn[0].getBoundingClientRect();
		const windowHeight = $(window).height();
		const edgePadding = 12;
		const menuWidth = 240;
		
		// Determine if menu should appear above or below button based on available space
		const spaceBelow = windowHeight - btnRect.bottom - edgePadding;
		const spaceAbove = btnRect.top - edgePadding;
		const showAbove = spaceBelow < 200 && spaceAbove > spaceBelow;
		
		const removeOptionHtml = currentSection ? `
			<div class="context-menu-item" data-action="remove">
				<i class="ti ti-x"></i> Remove from Section
			</div>
		` : '';
		
		// Build sections list - limit display if too many
		const sectionsHtml = channelSections.length > 0 ? channelSections.map(section => `
			<div class="context-menu-item ${currentSection && currentSection.id === section.id ? 'active' : ''}" data-action="assign" data-section-id="${section.id}">
				<i class="ti ${currentSection && currentSection.id === section.id ? 'ti-check' : 'ti-folder'}"></i>
				<span class="context-menu-item-text">${section.name}</span>
				${section.channelIds && section.channelIds.length > 0 ? `<span class="context-menu-item-count">${section.channelIds.length}</span>` : ''}
			</div>
		`).join('') : '';
		
		// Build menu structure without dividers
		let menuContentHtml = '';
		
		// Add remove option if applicable
		if (removeOptionHtml) {
			menuContentHtml += removeOptionHtml;
		}
		
		// Add sections list
		if (sectionsHtml) {
			menuContentHtml += sectionsHtml;
		}
		
		// Always show "Create New Section" at the bottom
		menuContentHtml += `
			<div class="context-menu-item" data-action="new">
				<i class="ti ti-plus"></i> Create New Section
			</div>
		`;
		
		// Always append to body and use fixed positioning to avoid stacking context issues
		const menuHtml = `
			<div class="section-dropdown-menu" data-button-id="${buttonId}" style="position: fixed; z-index: 99999 !important;">
				<div class="section-dropdown-menu-content">
					${menuContentHtml}
				</div>
			</div>
		`;
		
		$('body').append(menuHtml);
		
		// Adjust position after menu is rendered to get actual height
		const $menu = $('.section-dropdown-menu[data-button-id="' + buttonId + '"]');
		const actualHeight = $menu.outerHeight();
		
		// Calculate final position using viewport coordinates (getBoundingClientRect)
		const btnRectForPosition = $btn[0].getBoundingClientRect();
		let finalLeft = btnRectForPosition.right - menuWidth;
		let finalTop;
		
		if (showAbove) {
			// Position above button - bottom of dropdown aligns with top of button
			finalTop = btnRectForPosition.top - actualHeight;
		} else {
			// Position below button
			finalTop = btnRectForPosition.bottom + 5;
		}
		
		// Apply positioning
		$menu.css({
			left: finalLeft + 'px',
			top: finalTop + 'px',
			position: 'fixed',
			zIndex: '99999'
		});
		
		// Ensure menu doesn't go off screen edges
		const windowWidth = $(window).width();
		const menuRect = $menu[0].getBoundingClientRect();
		if (menuRect.left < edgePadding) {
			$menu.css('left', edgePadding + 'px');
		}
		if (menuRect.right > windowWidth - edgePadding) {
			$menu.css('left', (windowWidth - menuWidth - edgePadding) + 'px');
		}
		
		// Handle menu clicks
		$('.section-dropdown-menu .context-menu-item').on('click', async function() {
			const action = $(this).data('action');
			const sectionId = $(this).data('section-id');
			
			if (action === 'remove') {
				await removeChannelFromSection(channelId);
			} else if (action === 'assign') {
				await addChannelToSection(sectionId, channelId);
			} else if (action === 'new') {
				showSectionNameModal('Create New Section', '', async (sectionName) => {
					const newSection = createSection(sectionName);
					await addChannelToSection(newSection.id, channelId);
				});
			}
			
			$('.section-dropdown-menu').remove();
		});
		
		setTimeout(() => {
			// Remove any existing close handlers first
			$(document).off('click.dropdown-close');
			$(document).off('keydown.dropdown-close');
			
			const closeMenu = function(e) {
				if (!$(e.target).closest('.section-dropdown-menu').length && 
				    !$(e.target).closest('.stream-settings-btn').length) {
					$('.section-dropdown-menu').remove();
					$(document).off('click.dropdown-close', closeMenu);
					$(document).off('keydown.dropdown-close', closeMenuEscape);
				}
			};
			
			const closeMenuEscape = function(e) {
				if (e.key === 'Escape') {
					$('.section-dropdown-menu').remove();
					$(document).off('click.dropdown-close', closeMenu);
					$(document).off('keydown.dropdown-close', closeMenuEscape);
				}
			};
			
			$(document).on('click.dropdown-close', closeMenu);
			$(document).on('keydown.dropdown-close', closeMenuEscape);
		}, 150);
	});
}

function addCategoryActionButtons() {
	$('.category-item').each(function() {
		const $item = $(this);
		
		if ($item.find('.category-action-container').length > 0) {
			updateCategoryButtonStates($item);
			return;
		}
		
		let gameId = null;
		let $gameButton = null;
		
		if ($item.hasClass('gameButton')) {
			$gameButton = $item;
			gameId = $item.data('gameid');
		}
		
		if (!gameId) {
			gameId = $item.data('gameid');
			if (gameId) {
				$gameButton = $item;
			}
		}
		
		if (!gameId) {
			$gameButton = $item.closest('.gameButton');
			if ($gameButton.length > 0) {
				gameId = $gameButton.data('gameid');
			}
		}
		
		if (!gameId && $item.parent().hasClass('gameButton')) {
			$gameButton = $item.parent();
			gameId = $gameButton.data('gameid');
		}
		
		if (!gameId) {
			$gameButton = $item.find('.gameButton').first();
			if ($gameButton.length > 0) {
				gameId = $gameButton.data('gameid');
			}
		}
		
		if (!gameId) {
			let $check = $item;
			for (let i = 0; i < 3 && !gameId; i++) {
				gameId = $check.data('gameid');
				if (gameId) {
					$gameButton = $check;
					break;
				}
				$check = $check.parent();
			}
		}
		
		if (!gameId) {
			return;
		}
		
		// Normalize gameId to string for consistent storage and comparison
		const gameIdStr = String(gameId);
		
		// Create action container
		const $actionContainer = $('<div class="category-action-container"></div>');
		
		// Create favorite button
		const $favoriteBtn = $('<i class="ti ti-star favorite" data-categoryid="' + gameIdStr + '"></i>');
		
		// Create notification button
		const $notificationBtn = $('<i class="ti ti-bell notification" data-categoryid="' + gameIdStr + '"></i>');
		
		// Add buttons to container
		$actionContainer.append($favoriteBtn);
		$actionContainer.append($notificationBtn);
		
		// Add container to item
		$item.append($actionContainer);
		
		// Update selected state
		updateCategoryButtonStates($item);
	});
}

function updateCategoryButtonStates($item) {
	let gameId = null;
	if ($item.hasClass('gameButton') || $item.is('.gameButton')) {
		gameId = $item.data('gameid');
	} else {
		gameId = $item.find('.favorite').data('categoryid') || 
		         $item.find('.gameButton').data('gameid') || 
		         $item.closest('.gameButton').data('gameid');
	}
	
	if (!gameId) return;
	
	// Normalize gameId to string for comparison (data attributes might return numbers)
	const gameIdStr = String(gameId);
	
	const $favoriteBtn = $item.find('.favorite[data-categoryid="' + gameIdStr + '"]');
	const $notificationBtn = $item.find('.notification[data-categoryid="' + gameIdStr + '"]');
	const $actionContainer = $item.find('.category-action-container');
	
	// Update favorite button state - compare as strings
	if (followedCategories.includes(gameIdStr) || followedCategories.includes(gameId)) {
		$favoriteBtn.addClass('selected');
	} else {
		$favoriteBtn.removeClass('selected');
	}
	
	// Update notification button state - compare as strings
	if (categoryNotifyList.includes(gameIdStr) || categoryNotifyList.includes(gameId)) {
		$notificationBtn.addClass('selected');
	} else {
		$notificationBtn.removeClass('selected');
	}
	
	// Show container if any button is selected (for browsers that don't support :has())
	if ($favoriteBtn.hasClass('selected') || $notificationBtn.hasClass('selected')) {
		$actionContainer.addClass('has-selected');
	} else {
		$actionContainer.removeClass('has-selected');
	}
}

function isCategoryFavorite($item) {
	if ($item.find('.favorite.selected').length > 0) {
		return true;
	}
	
	let gameId = null;
	if ($item.hasClass('gameButton')) {
		gameId = $item.data('gameid');
	} else {
		gameId = $item.find('.favorite').data('categoryid') || 
		         $item.find('.gameButton').data('gameid') || 
		         $item.closest('.gameButton').data('gameid');
	}
	
	if (gameId) {
		const gameIdStr = String(gameId);
		return followedCategories.some(id => String(id) === gameIdStr);
	}
	
	return false;
}

let isOrganizingGames = false; // Prevent concurrent organization

function organizeGameListByFavorites() {
	// Prevent concurrent execution
	if (isOrganizingGames) {
		return;
	}
	
	isOrganizingGames = true;
	
	try {
		// Organize both top game list and search category results
		const containers = [
			$('#topGameList_Wrapper .twitch-go-category-container'),
			$('#searchCategoryResult_Wrapper .twitch-go-category-container')
		];
		
		containers.forEach($container => {
			if ($container.length === 0) return;
			
			// Get all category items - use direct children only to avoid nested items
			const allItems = $container.children('.category-item').toArray();
			
			if (allItems.length === 0) return;
			
			// Separate favorites from non-favorites
			const favoriteItems = [];
			const nonFavoriteItems = [];
			const processedIds = new Set(); // Track processed items to prevent duplicates
			
			allItems.forEach(item => {
				const $item = $(item);
				const gameId = $item.data('gameid');
				
				// Skip if we've already processed this item (prevent duplicates)
				if (gameId && processedIds.has(String(gameId))) {
					return;
				}
				
				if (gameId) {
					processedIds.add(String(gameId));
				}
				
				if (isCategoryFavorite($item)) {
					favoriteItems.push(item);
				} else {
					nonFavoriteItems.push(item);
				}
			});
			
			// Rebuild container with favorites first
			$container.empty();
			
			// Add favorite items first
			favoriteItems.forEach(item => {
				$container.append(item);
			});
			
			// Add non-favorite items
			nonFavoriteItems.forEach(item => {
				$container.append(item);
			});
		});
	} finally {
		isOrganizingGames = false;
	}
}

async function getTopGameList(useCache = true, searchTerm = null) {
	let cursor = null;

	const placeHolderWrapper = $("#topGameListPlaceholder_Wrapper");
	const topGameList = $("#topGameList_Wrapper");
	
	// Don't use cache when searching
	const shouldUseCache = useCache && !searchTerm;
	
	// Only show placeholder if there's no cache
	let hasCache = false;
	if (shouldUseCache && !topGameList.is(':visible')) {
		const cachedData = await browser.storage.local.get(['cachedTopGameList']);
		if (cachedData.cachedTopGameList) {
			hasCache = true;
			
			placeHolderWrapper.hide();
			
			topGameList.html(cachedData.cachedTopGameList);
			addCategoryActionButtons();
			requestAnimationFrame(() => {
				organizeGameListByFavorites();
			});
			await initTopGameListButton();
			topGameList.show();
			
			requestAnimationFrame(() => {
				initImageLoading();
				// Immediate check for already-loaded cached images
				topGameList.find('.category-preview img').each(function() {
					if (this.complete && this.naturalHeight > 0 && !$(this).hasClass('loaded')) {
						$(this).addClass('loaded');
						$(this).closest('.category-preview').addClass('image-loaded');
					}
				});
			});
		} else {
			// No cache exists - show placeholder while loading
			placeHolderWrapper.show();
			topGameList.hide();
		}
	} else if (!shouldUseCache) {
		// Not using cache - show placeholder while loading
		placeHolderWrapper.show();
		topGameList.hide();
	} else {
		// Content is already visible (background refresh) - ensure placeholder is hidden
		placeHolderWrapper.hide();
	}
	
	// Fetch fresh data in background
	const followedCategoriesParam = followedCategories && followedCategories.length > 0 ? `&followedCategories=${followedCategories.join(',')}` : '';
	const searchParam = searchTerm ? `&searchTerm=${encodeURIComponent(searchTerm)}` : '';
	const fetchPromise = await fetch(`${ghostirCore}/Twitch/API/GetTopGameList?authToken=${accessToken}&browserType=${browserType}&returnAmount=${topGamesReturnAmount}${followedCategoriesParam}${searchParam}`);
	const returnedData = await fetchPromise.json();

	// Check if this is a background refresh (content already visible and has content)
	const hasExistingContent = topGameList.is(':visible') && topGameList.length > 0;
	const existingHtml = hasExistingContent ? topGameList.html() : '';
	const isBackgroundRefresh = useCache && hasExistingContent && existingHtml.trim().length > 0;
	
	// For background refresh, preload images before replacing
	let currentHtml = '';
	let newHtml = '';
	if (isBackgroundRefresh) {
		currentHtml = topGameList.html();
		newHtml = returnedData.ReturnHtml;
		// Only replace if content actually changed
		if (currentHtml !== newHtml) {
			// Create a temporary hidden wrapper to organize content
			const $tempWrapper = $('<div id="topGameList_Wrapper" style="position: absolute; visibility: hidden; pointer-events: none; left: -9999px;"></div>');
			$('body').append($tempWrapper);
			$tempWrapper.html(newHtml);
			
			// Organize in the hidden container using existing functions
			addCategoryActionButtons();
			organizeGameListByFavorites();
			
			const organizedHtml = $tempWrapper.html();
			$tempWrapper.remove();
			
			await preloadCategoryImagesAndReplace(topGameList, organizedHtml, () => {
				addCategoryActionButtons();
			});
		} else {
			// Content unchanged, just update cache - no need to do anything else
			await browser.storage.local.set({ 'cachedTopGameList': returnedData.ReturnHtml });
			return; // Exit early to prevent double operations
		}
	} else {
		// For initial load, set HTML and organize normally
		// Hide placeholder FIRST synchronously to prevent layout shift
		placeHolderWrapper.hide();
		
		topGameList.html(returnedData.ReturnHtml);
		addCategoryActionButtons();
		organizeGameListByFavorites();
		
		// Initialize image loading and check for already-loaded images
		initImageLoading();
		
		// Immediate check for already-loaded cached images after HTML replacement
		topGameList.find('.category-preview img').each(function() {
			if (this.complete && this.naturalHeight > 0 && !$(this).hasClass('loaded')) {
				$(this).addClass('loaded');
				$(this).closest('.category-preview').addClass('image-loaded');
			}
		});
		
		// Double-check in requestAnimationFrame for images that load very quickly
		requestAnimationFrame(() => {
			topGameList.find('.category-preview img').each(function() {
				if (this.complete && this.naturalHeight > 0 && !$(this).hasClass('loaded')) {
					$(this).addClass('loaded');
					$(this).closest('.category-preview').addClass('image-loaded');
				}
			});
		});
	}

	if (!isBackgroundRefresh || (isBackgroundRefresh && currentHtml !== newHtml)) {
		await browser.storage.local.set({ 'cachedTopGameList': returnedData.ReturnHtml });
	}

	if (!isBackgroundRefresh) {
		await initTopGameListButton();
	}
	
	if (!isBackgroundRefresh && !hasCache) {
		placeHolderWrapper.hide();
		topGameList.show();
	}

	if (returnedData.Cursor != null) {
		cursor = returnedData.Cursor;

		const loadMoreButton = $('#topGameListLoadMore_Button');
		const loadMoreWrapper = $('#topGameListLoadMore_Wrapper');

		loadMoreButton.click(async () => {
			const followedCategoriesParam = followedCategories && followedCategories.length > 0 ? `&followedCategories=${followedCategories.join(',')}` : '';
			const fetchPromise = await fetch(`${ghostirCore}/Twitch/API/GetTopGameList?authToken=${accessToken}&browserType=${browserType}&returnAmount=${topGamesReturnAmount}&cursor=${cursor}${followedCategoriesParam}`);
			const returnedData = await fetchPromise.json();

			if(returnedData.Count > 0) {
				topGameList.find('.twitch-go-category-container').append(returnedData.ReturnHtml);
				addCategoryActionButtons();
				organizeGameListByFavorites();
				await initTopGameListButton();
				
				// Re-run search if there's a search filter active
				const searchValue = $('#searchTab').val();
				if (searchValue && searchValue.length > 0) {
					await searchLogic();
				}
				
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

	$('#topGameList_Wrapper').unbind('click').on('click', '.gameButton', async (event) => {
		// Don't open game if clicking on action buttons
		if ($(event.target).closest('.category-action-container').length > 0 || 
		    $(event.target).hasClass('favorite') || 
		    $(event.target).hasClass('notification') ||
		    $(event.target).closest('.favorite').length > 0 ||
		    $(event.target).closest('.notification').length > 0) {
			return;
		}
		
		let gameId = $(event.currentTarget).data('gameid');
		let gameName = $(event.currentTarget).data('gamename') || $(event.currentTarget).find('.category-name').text() || 'Game';
		let gameBoxArt = $(event.currentTarget).find('img').attr('src') || $(event.currentTarget).find('.category-preview img').attr('src') || '';

		const fetchPromise = await fetch(`${ghostirCore}/Twitch/API/GetTopGameStreamList?authToken=${accessToken}&browserType=${browserType}&notificationFavoritePosition=${notificationFavoritePosition}&notifyList=${notifyList.join(',')}&gameId=${gameId}`);
		const returnedData = await fetchPromise.json();

		// Create game header with background image and preview
		const gameHeader = `
			<div class="game-header-section" ${gameBoxArt ? `style="--bg-image: url('${gameBoxArt}');"` : ''}>
				<div class="game-header-overlay"></div>
				<div class="game-header-content">
					${gameBoxArt ? `<div class="game-header-logo"><img src="${gameBoxArt}" alt="${gameName}"></div>` : ''}
					<h2 class="game-header-title">${gameName}</h2>
				</div>
				<button class="game-header-back-button" id="gameHeaderBackButton" title="Back to Games">
					<i class="ti ti-arrow-left"></i>
				</button>
			</div>
		`;

		topGameStreamList.html(gameHeader + returnedData.ReturnHtml);

		// Initialize image loading for stream previews
		initImageLoading();
		
		// Immediate check for already-loaded cached images
		topGameStreamList.find('.stream-item-preview img').each(function() {
			if (this.complete && this.naturalHeight > 0 && !$(this).hasClass('loaded')) {
				$(this).addClass('loaded');
				$(this).closest('.stream-item-preview').addClass('image-loaded');
			}
		});

		if (returnedData.Cursor != null) {
			let cursor = returnedData.Cursor;

			const loadMoreButton = $('#topGameStreamListLoadMore_Button');
			const loadMoreWrapper = $('#topGameStreamListLoadMore_Wrapper');

			loadMoreButton.click(async () => {
				const fetchPromise = await fetch(`${ghostirCore}/Twitch/API/GetTopGameStreamList?authToken=${accessToken}&browserType=${browserType}&notificationFavoritePosition=${notificationFavoritePosition}&notifyList=${notifyList.join(',')}&gameId=${gameId}&cursor=${cursor}`);
				const returnedData = await fetchPromise.json();

				if(returnedData.Count > 0) {
					topGameStreamList.find('.twitch-go-stream-container').append(returnedData.ReturnHtml);

					// Initialize image loading for newly loaded stream previews
					initImageLoading();

					cursor = returnedData.Cursor;

					if(cursor == null){
						loadMoreWrapper.remove();
					}
				} else {
					loadMoreWrapper.remove();
				}
			});
		}

		// Handle back button click (both navbar and header button)
		const handleBackClick = () => {
			$('.twitch-go-content').scrollTop(0);
			topGameStreamList.scrollTop(0);

			$('#backGames').hide();
			topGameList.show();
			topGameStreamList.hide();
			topGameStreamList.html("");
		};

		backGames.on('click', handleBackClick);
		
		// Handle game header back button click
		$(document).off('click', '#gameHeaderBackButton').on('click', '#gameHeaderBackButton', handleBackClick);

		backGames.show();
		topGameList.hide();
		topGameStreamList.show();
		$('.twitch-go-content').scrollTop(0);
	});
}

async function getTopStreamList(useCache = true, searchTerm = null) {
	let cursor = null;

	const placeHolderWrapper = $("#topStreamListPlaceholder_Wrapper");
	const topStreamList = $("#topStreamList_Wrapper");
	
	// Don't use cache when searching
	const shouldUseCache = useCache && !searchTerm;
	
	// Try to load cached HTML first (only if content is not already visible)
	if (shouldUseCache && !topStreamList.is(':visible')) {
		const cachedData = await browser.storage.local.get(['cachedTopStreamList']);
		if (cachedData.cachedTopStreamList) {
			topStreamList.html(cachedData.cachedTopStreamList);
			placeHolderWrapper.hide();
			topStreamList.show();
			
			// Initialize image loading for cached content
			requestAnimationFrame(() => {
				initImageLoading();
				// Immediate check for already-loaded cached images
				topStreamList.find('.stream-item-preview img').each(function() {
					if (this.complete && this.naturalHeight > 0 && !$(this).hasClass('loaded')) {
						$(this).addClass('loaded');
						$(this).closest('.stream-item-preview').addClass('image-loaded');
					}
				});
			});
		} else {
			// No cache exists - show placeholder while loading
			placeHolderWrapper.show();
			topStreamList.hide();
		}
	} else if (!shouldUseCache) {
		// Not using cache - show placeholder while loading
		placeHolderWrapper.show();
		topStreamList.hide();
	}
	
	// Fetch fresh data in background
	const searchParam = searchTerm ? `&searchTerm=${encodeURIComponent(searchTerm)}` : '';
	const fetchPromise = await fetch(`${ghostirCore}/Twitch/API/GetTopStreamList?authToken=${accessToken}&browserType=${browserType}&notificationFavoritePosition=${notificationFavoritePosition}&returnAmount=${topStreamsReturnAmount}&notifyList=${notifyList.join(',')}${searchParam}`);
	const returnedData = await fetchPromise.json();

	// Check if this is a background refresh (content already visible and has content)
	const hasExistingContent = topStreamList.is(':visible') && topStreamList.length > 0;
	const existingHtml = hasExistingContent ? topStreamList.html() : '';
	const isBackgroundRefresh = useCache && hasExistingContent && existingHtml.trim().length > 0;
	
	// For background refresh, preload images before replacing
	if (isBackgroundRefresh) {
		const currentHtml = topStreamList.html();
		const newHtml = returnedData.ReturnHtml;
		// Only replace if content actually changed
		if (currentHtml !== newHtml) {
			// Preload images before replacing to prevent visual reload
			await preloadImagesAndReplace(topStreamList, newHtml, () => {
				// Images are already marked as loaded in preloadImagesAndReplace
			});
		}
	} else {
		// Not a background refresh, replace HTML normally
		// Hide placeholder FIRST synchronously to prevent layout shift
		placeHolderWrapper.hide();
		
		topStreamList.html(returnedData.ReturnHtml);
		
		// Initialize image loading and check for already-loaded images
		initImageLoading();
		
		// Immediate check for already-loaded cached images after HTML replacement
		topStreamList.find('.stream-item-preview img').each(function() {
			if (this.complete && this.naturalHeight > 0 && !$(this).hasClass('loaded')) {
				$(this).addClass('loaded');
				$(this).closest('.stream-item-preview').addClass('image-loaded');
			}
		});
		
		// Double-check in requestAnimationFrame for images that load very quickly
		requestAnimationFrame(() => {
			topStreamList.find('.stream-item-preview img').each(function() {
				if (this.complete && this.naturalHeight > 0 && !$(this).hasClass('loaded')) {
					$(this).addClass('loaded');
					$(this).closest('.stream-item-preview').addClass('image-loaded');
				}
			});
		});
	}
	
	// Only show/hide placeholders if this is NOT a background refresh
	if (!isBackgroundRefresh) {
		placeHolderWrapper.hide();
		topStreamList.show();
		topStreamList.css({'display': 'block', 'visibility': 'visible', 'opacity': '1'});
	}
	
	// Cache the HTML
	await browser.storage.local.set({ 'cachedTopStreamList': returnedData.ReturnHtml });

	if (returnedData.Cursor != null) {
		cursor = returnedData.Cursor;

		const loadMoreButton = $('#topStreamListLoadMore_Button');
		const loadMoreWrapper = $('#topStreamListLoadMore_Wrapper');

		loadMoreButton.click(async () => {
			const fetchPromise = await fetch(`${ghostirCore}/Twitch/API/GetTopStreamList?authToken=${accessToken}&browserType=${browserType}&notificationFavoritePosition=${notificationFavoritePosition}&returnAmount=${topStreamsReturnAmount}&notifyList=${notifyList.join(',')}&cursor=${cursor}`);
			const returnedData = await fetchPromise.json();

			if(returnedData.Count > 0) {
				topStreamList.find('.twitch-go-stream-container').append(returnedData.ReturnHtml);

				// Re-run search if there's a search filter active
				const searchValue = $('#searchTab').val();
				if (searchValue && searchValue.length > 0) {
					await searchLogic();
				}

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
	const searchCategoryStreamListResult = $('#searchCategoryStreamList_Wrapper');
	const searchStreamResultPlaceholder = $('#searchStreamResultPlaceholder_Wrapper');

	const searchCategoryResult = $('#searchCategoryResult_Wrapper');
	const searchCategoryResultPlaceholder = $('#searchCategoryResultPlaceholder_Wrapper');
	
	$('.navigation-list-button').click(async (event) => {
		$('#backGames').hide();
		searchCategoryResult.show();
		searchCategoryStreamListResult.hide();
		
		const tabTarget = $(event.currentTarget).data('target');
		const $button = $(event.currentTarget);

		$('.navigation-list-button').removeClass('active');
		$button.addClass('active');

		$('.navigation-tab').removeClass('active');
		$(tabTarget).addClass('active');
		
		const currentPane = $(".navigation-tab.active")[0];
		const paneCode = $(currentPane).data('type');

		switch (paneCode) {
			case 'Stream':
				if (searchInput.val().length === 0) {
					searchStreamResult.html('<div class="twitch-go-search-placeholder"><i>Search for your Favorite Streamer...</i></div>');
				} else {
					await performSearch(paneCode, searchInput.val());
				}
				break;
			case 'Category':
				if (searchInput.val().length === 0) {
					searchCategoryResult.html('<div class="twitch-go-search-placeholder"><i>Search for your Favorite Game/Category...</i></div>');
				} else {
					await performSearch(paneCode, searchInput.val());
				}
				break;
		}
	});
	
	if (searchInput.val().length === 0) {
		searchStreamResult.html('<div class="twitch-go-search-placeholder"><i>Search for your Favorite Streamer...</i></div>');
	}

	let typingTimer;
	const doneTypingInterval = 500; // Reduced from 1000ms for better responsiveness
	
	// Helper function to perform search
	async function performSearch(paneCode, searchTerm) {
		let filter = searchTerm.toUpperCase();
		
		switch (paneCode) {
			case 'Stream':
				if(filter.length === 0) {
					searchStreamResult.html('<div class="twitch-go-search-placeholder"><i>Search for your Favorite Stream...</i></div>');
				} else {
					searchStreamResult.hide();
					searchStreamResultPlaceholder.show();
					
					try {
						const fetchPromise = await fetch(`${ghostirCore}/Twitch/API/GetSearchList?authToken=${accessToken}&browserType=${browserType}&searchType=${paneCode}&searchTerm=${encodeURIComponent(searchTerm)}`);
						const returnedData = await fetchPromise.json();
						
						if (returnedData.ReturnHtml && returnedData.ReturnHtml.trim().length > 0) {
							searchStreamResult.html(returnedData.ReturnHtml);
							// Initialize image loading for search results
							initImageLoading();
							// Check for already-loaded images
							searchStreamResult.find('.stream-item-preview img').each(function() {
								if (this.complete && this.naturalHeight > 0 && !$(this).hasClass('loaded')) {
									$(this).addClass('loaded');
									$(this).closest('.stream-item-preview').addClass('image-loaded');
								}
							});
							// Initialize button handlers
							await initFollowingListButton();
						} else {
							searchStreamResult.html('<div class="twitch-go-search-placeholder"><i class="ti ti-search" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;"></i><div>No streams found</div><div style="font-size: 14px; opacity: 0.7; margin-top: 8px;">Try a different search term</div></div>');
						}
						searchStreamResult.show();
						searchStreamResultPlaceholder.hide();
					} catch (error) {
						console.error('Search error:', error);
						searchStreamResult.html('<div class="twitch-go-search-placeholder"><i>Error searching. Please try again.</i></div>');
						searchStreamResult.show();
						searchStreamResultPlaceholder.hide();
					}
				}
				break;
			case 'Category':
				if(filter.length === 0) {
					searchCategoryResult.html('<div class="twitch-go-search-placeholder"><i>Search for your Favorite Game/Category...</i></div>');
				} else {
					searchCategoryResult.hide();
					searchCategoryResultPlaceholder.show();
					
					try {
						const followedCategoriesParam = followedCategories && followedCategories.length > 0 ? `&followedCategories=${followedCategories.join(',')}` : '';
						const fetchPromise = await fetch(`${ghostirCore}/Twitch/API/GetSearchList?authToken=${accessToken}&browserType=${browserType}&searchType=${paneCode}&searchTerm=${encodeURIComponent(searchTerm)}${followedCategoriesParam}`);
						const returnedData = await fetchPromise.json();
						
						if (returnedData.ReturnHtml && returnedData.ReturnHtml.trim().length > 0) {
							searchCategoryResult.html(returnedData.ReturnHtml);
							// Initialize image loading for category results
							initImageLoading();
							// Check for already-loaded images
							searchCategoryResult.find('.category-preview img').each(function() {
								if (this.complete && this.naturalHeight > 0 && !$(this).hasClass('loaded')) {
									$(this).addClass('loaded');
									$(this).closest('.category-preview').addClass('image-loaded');
								}
							});
							addCategoryActionButtons();
							organizeGameListByFavorites();
							await initSearchCategoryStreamListButton();
						} else {
							searchCategoryResult.html('<div class="twitch-go-search-placeholder"><i class="ti ti-search" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;"></i><div>No games found</div><div style="font-size: 14px; opacity: 0.7; margin-top: 8px;">Try a different search term</div></div>');
						}
						searchCategoryResult.show();
						searchCategoryResultPlaceholder.hide();
					} catch (error) {
						console.error('Search error:', error);
						searchCategoryResult.html('<div class="twitch-go-search-placeholder"><i>Error searching. Please try again.</i></div>');
						searchCategoryResult.show();
						searchCategoryResultPlaceholder.hide();
					}
				}
				break;
		}
	}

	searchInput.on('keyup', function () {
		$('#backGames').hide();
		const currentTab = $(".sidebar-button.active")[0];
		let tabCode = $(currentTab).data('section-code');

		const currentPane = $('.navigation-tab.active')[0];
		const paneCode = $(currentPane).data('type');
		
		if (tabCode === 'Search') {
			// Search tab - use performSearch function
			clearTimeout(typingTimer);
			typingTimer = setTimeout(async function() {
				await performSearch(paneCode, searchInput.val());
			}, doneTypingInterval);
		} else if (tabCode === 'FollowingStreams' || tabCode === 'TopGames' || tabCode === 'TopStreams') {
			// Other tabs - use searchLogic to filter current tab
			clearTimeout(typingTimer);
			typingTimer = setTimeout(async function() {
				await searchLogic();
			}, doneTypingInterval);
		}
	});

	searchInput.on('keydown', function (e) {
		clearTimeout(typingTimer);
		
		// Enter key - search immediately
		if (e.key === 'Enter') {
			e.preventDefault();
			clearTimeout(typingTimer);
			const currentTab = $(".sidebar-button.active")[0];
			const tabCode = $(currentTab).data('section-code');
			const currentPane = $('.navigation-tab.active')[0];
			const paneCode = $(currentPane).data('type');
			
			if (tabCode === 'Search') {
				performSearch(paneCode, searchInput.val()).catch(err => console.error('Search error:', err));
			} else if (tabCode === 'FollowingStreams' || tabCode === 'TopGames' || tabCode === 'TopStreams') {
				searchLogic().catch(err => console.error('Search error:', err));
			}
		}
		
		// Escape key - clear search
		if (e.key === 'Escape') {
			searchInput.val('');
			$('#searchClear').hide();
			const currentTab = $(".sidebar-button.active")[0];
			const tabCode = $(currentTab).data('section-code');
			const currentPane = $('.navigation-tab.active')[0];
			const paneCode = $(currentPane).data('type');
			
			if (tabCode === 'Search') {
				if (paneCode === 'Stream') {
					searchStreamResult.html('<div class="twitch-go-search-placeholder"><i>Search for your Favorite Streamer...</i></div>');
				} else if (paneCode === 'Category') {
					searchCategoryResult.html('<div class="twitch-go-search-placeholder"><i>Search for your Favorite Game/Category...</i></div>');
				}
			} else if (tabCode === 'FollowingStreams' || tabCode === 'TopGames' || tabCode === 'TopStreams') {
				// Clear filter on other tabs
				searchLogic();
			}
		}
	});
	
	// Clear search button
	$('#searchClear').on('click', function() {
		searchInput.val('');
		$('#searchClear').hide();
		searchInput.focus();
		const currentTab = $(".sidebar-button.active")[0];
		const tabCode = $(currentTab).data('section-code');
		const currentPane = $('.navigation-tab.active')[0];
		const paneCode = $(currentPane).data('type');
		
		if (tabCode === 'Search') {
			if (paneCode === 'Stream') {
				searchStreamResult.html('<div class="twitch-go-search-placeholder"><i>Search for your Favorite Streamer...</i></div>');
			} else if (paneCode === 'Category') {
				searchCategoryResult.html('<div class="twitch-go-search-placeholder"><i>Search for your Favorite Game/Category...</i></div>');
			}
		} else if (tabCode === 'FollowingStreams' || tabCode === 'TopGames' || tabCode === 'TopStreams') {
			// Clear filter on other tabs
			searchLogic();
		}
	});
	
	// Show/hide clear button based on input value
	searchInput.on('input', function() {
		if ($(this).val().length > 0) {
			$('#searchClear').show();
		} else {
			$('#searchClear').hide();
		}
	});
	
	// Auto-focus search when Search tab is active
	$('.sidebar-button[data-section-code="Search"]').on('click', function() {
		setTimeout(() => {
			searchInput.focus();
		}, 100);
	});
	
	// Helper function to perform search
	async function performSearch(paneCode, searchTerm) {
		let filter = searchTerm.toUpperCase();
		
		switch (paneCode) {
			case 'Stream':
				if(filter.length === 0) {
					searchStreamResult.html('<div class="twitch-go-search-placeholder"><i>Search for your Favorite Stream...</i></div>');
				} else {
					searchStreamResult.hide();
					searchStreamResultPlaceholder.show();
					
					try {
						const fetchPromise = await fetch(`${ghostirCore}/Twitch/API/GetSearchList?authToken=${accessToken}&browserType=${browserType}&searchType=${paneCode}&searchTerm=${encodeURIComponent(searchTerm)}`);
						const returnedData = await fetchPromise.json();
						
						if (returnedData.ReturnHtml && returnedData.ReturnHtml.trim().length > 0) {
							searchStreamResult.html(returnedData.ReturnHtml);
							// Initialize image loading for search results
							initImageLoading();
							// Check for already-loaded images
							searchStreamResult.find('.stream-item-preview img').each(function() {
								if (this.complete && this.naturalHeight > 0 && !$(this).hasClass('loaded')) {
									$(this).addClass('loaded');
									$(this).closest('.stream-item-preview').addClass('image-loaded');
								}
							});
							// Initialize button handlers
							await initFollowingListButton();
						} else {
							searchStreamResult.html('<div class="twitch-go-search-placeholder"><i class="ti ti-search" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;"></i><div>No streams found</div><div style="font-size: 14px; opacity: 0.7; margin-top: 8px;">Try a different search term</div></div>');
						}
						searchStreamResult.show();
						searchStreamResultPlaceholder.hide();
					} catch (error) {
						console.error('Search error:', error);
						searchStreamResult.html('<div class="twitch-go-search-placeholder"><i>Error searching. Please try again.</i></div>');
						searchStreamResult.show();
						searchStreamResultPlaceholder.hide();
					}
				}
				break;
			case 'Category':
				if(filter.length === 0) {
					searchCategoryResult.html('<div class="twitch-go-search-placeholder"><i>Search for your Favorite Game/Category...</i></div>');
				} else {
					searchCategoryResult.hide();
					searchCategoryResultPlaceholder.show();
					
					try {
						const followedCategoriesParam = followedCategories && followedCategories.length > 0 ? `&followedCategories=${followedCategories.join(',')}` : '';
						const fetchPromise = await fetch(`${ghostirCore}/Twitch/API/GetSearchList?authToken=${accessToken}&browserType=${browserType}&searchType=${paneCode}&searchTerm=${encodeURIComponent(searchTerm)}${followedCategoriesParam}`);
						const returnedData = await fetchPromise.json();
						
						if (returnedData.ReturnHtml && returnedData.ReturnHtml.trim().length > 0) {
							searchCategoryResult.html(returnedData.ReturnHtml);
							// Initialize image loading for category results
							initImageLoading();
							// Check for already-loaded images
							searchCategoryResult.find('.category-preview img').each(function() {
								if (this.complete && this.naturalHeight > 0 && !$(this).hasClass('loaded')) {
									$(this).addClass('loaded');
									$(this).closest('.category-preview').addClass('image-loaded');
								}
							});
							addCategoryActionButtons();
							organizeGameListByFavorites();
							await initSearchCategoryStreamListButton();
						} else {
							searchCategoryResult.html('<div class="twitch-go-search-placeholder"><i class="ti ti-search" style="font-size: 48px; opacity: 0.3; margin-bottom: 16px;"></i><div>No games found</div><div style="font-size: 14px; opacity: 0.7; margin-top: 8px;">Try a different search term</div></div>');
						}
						searchCategoryResult.show();
						searchCategoryResultPlaceholder.hide();
					} catch (error) {
						console.error('Search error:', error);
						searchCategoryResult.html('<div class="twitch-go-search-placeholder"><i>Error searching. Please try again.</i></div>');
						searchCategoryResult.show();
						searchCategoryResultPlaceholder.hide();
					}
				}
				break;
		}
	}
}

async function initSearchCategoryStreamListButton() {
	const searchCategoryResult = $('#searchCategoryResult_Wrapper');
	const searchCategoryStreamListResult = $('#searchCategoryStreamList_Wrapper');
	const backGames = $('#backGames');

	$('#searchCategoryResult_Tab').unbind('click').on('click', '.gameButton', async (event) => {
		// Don't open game if clicking on action buttons
		if ($(event.target).closest('.category-action-container').length > 0 || 
		    $(event.target).hasClass('favorite') || 
		    $(event.target).hasClass('notification') ||
		    $(event.target).closest('.favorite').length > 0 ||
		    $(event.target).closest('.notification').length > 0) {
			return;
		}
		
		let gameId = $(event.currentTarget).data('gameid');
		let gameName = $(event.currentTarget).data('gamename') || $(event.currentTarget).find('.category-name').text() || 'Game';
		let gameBoxArt = $(event.currentTarget).find('img').attr('src') || $(event.currentTarget).find('.category-preview img').attr('src') || '';

		const fetchPromise = await fetch(`${ghostirCore}/Twitch/API/GetTopGameStreamList?authToken=${accessToken}&browserType=${browserType}&notificationFavoritePosition=${notificationFavoritePosition}&notifyList=${notifyList.join(',')}&gameId=${gameId}`);
		const returnedData = await fetchPromise.json();

		// Create game header with background image and preview
		const gameHeader = `
			<div class="game-header-section" ${gameBoxArt ? `style="--bg-image: url('${gameBoxArt}');"` : ''}>
				<div class="game-header-overlay"></div>
				<div class="game-header-content">
					${gameBoxArt ? `<div class="game-header-logo"><img src="${gameBoxArt}" alt="${gameName}"></div>` : ''}
					<h2 class="game-header-title">${gameName}</h2>
				</div>
			</div>
		`;

		searchCategoryStreamListResult.html(gameHeader + returnedData.ReturnHtml);
		
		// Initialize image loading for stream previews
		initImageLoading();
		
		// Immediate check for already-loaded cached images
		searchCategoryStreamListResult.find('.stream-item-preview img').each(function() {
			if (this.complete && this.naturalHeight > 0 && !$(this).hasClass('loaded')) {
				$(this).addClass('loaded');
				$(this).closest('.stream-item-preview').addClass('image-loaded');
			}
		});

		if (returnedData.Cursor != null) {
			let cursor = returnedData.Cursor;

			const loadMoreButton = $('#categoryStreamListLoadMore_Button');
			const loadMoreWrapper = $('#categoryStreamListLoadMore_Wrapper');

			loadMoreButton.click(async () => {
				const fetchPromise = await fetch(`${ghostirCore}/Twitch/API/GetTopGameStreamList?authToken=${accessToken}&browserType=${browserType}&notificationFavoritePosition=${notificationFavoritePosition}&notifyList=${notifyList.join(',')}&gameId=${gameId}&cursor=${cursor}`);
				const returnedData = await fetchPromise.json();

				if(returnedData.Count > 0) {
					searchCategoryStreamListResult.find('.twitch-go-stream-container').append(returnedData.ReturnHtml);

					// Initialize image loading for newly loaded stream previews
					initImageLoading();

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
			$('.twitch-go-content').scrollTop(0);
			searchCategoryStreamListResult.scrollTop(0);

			backGames.hide();
			searchCategoryResult.show();
			searchCategoryStreamListResult.hide();
			searchCategoryStreamListResult.html("");
		});

		backGames.show();
		searchCategoryResult.hide();
		searchCategoryStreamListResult.show();
		$('.twitch-go-content').scrollTop(0);
	});
}

async function initTabSearch() {
	$('#searchTab').on('keyup', async () => {
		await searchLogic();
	});
}

function initOverlayScrollbars() {
	// Initialize OverlayScrollbars on scrollable containers
	if (typeof OverlayScrollbarsGlobal !== 'undefined' && typeof OverlayScrollbarsGlobal.OverlayScrollbars !== 'undefined') {
		// Initialize on main content wrapper
		const contentWrapper = document.querySelector('#content_Wrapper');
		if (contentWrapper) {
			// Destroy existing instance if it exists
			const existingInstance = OverlayScrollbarsGlobal.OverlayScrollbars(contentWrapper);
			if (existingInstance) {
				existingInstance.sleep();
			}
			
			// Initialize with proper options
			OverlayScrollbarsGlobal.OverlayScrollbars(contentWrapper, {
				scrollbars: {
					visibility: 'auto',
					autoHide: 'move',
					autoHideDelay: 800
				},
				overflowBehavior: {
					x: 'hidden',
					y: 'scroll'
				}
			});
		}
		
		// Initialize on search tab container
		const searchTab = document.querySelector('.content-tab.search');
		if (searchTab) {
			// Destroy existing instance if it exists
			const existingSearchInstance = OverlayScrollbarsGlobal.OverlayScrollbars(searchTab);
			if (existingSearchInstance) {
				existingSearchInstance.sleep();
			}
			
			// Initialize with proper options
			OverlayScrollbarsGlobal.OverlayScrollbars(searchTab, {
				scrollbars: {
					visibility: 'auto',
					autoHide: 'move',
					autoHideDelay: 800
				},
				overflowBehavior: {
					x: 'hidden',
					y: 'scroll'
				}
			});
		}
	}
}

async function searchLogic() {
	let streamItemList;
	let filterValue = String($('#searchTab').val() || '').trim();
	const searchTerm = filterValue; // Keep original for API calls
	filterValue = filterValue.toUpperCase();

	const currentTab = $(".content-tab.active")[0];
	const currentTabCode = $(".sidebar-button.active").data('section-code');

	// For TopStreams and TopGames, use API search instead of client-side filtering
	if (currentTabCode === 'TopStreams' || currentTabCode === 'TopGames') {
		// Call the appropriate API with search term (or empty to clear search)
		if (currentTabCode === 'TopStreams') {
			await getTopStreamList(false, searchTerm || null);
		} else if (currentTabCode === 'TopGames') {
			await getTopGameList(false, searchTerm || null);
		}
		return;
	}

	// Search in multiple types of items: filter-items, category-items, and stream-items
	streamItemList = $(currentTab).find('.filter-container .filter-item, .category-item, .stream-item');
	
	// If no filter value, show all items and section groups
	if (!filterValue || filterValue.length === 0) {
		streamItemList.show();
		// Show all section groups
		if (currentTabCode === 'FollowingStreams') {
			$(currentTab).find('.channel-section').show();
		}
		return;
	}
	
	for (let i = 0; i < streamItemList.length; i++) {
		const currentListItem = streamItemList[i];
		const $item = $(currentListItem);

		// Try different ways to get searchable text
		let searchValue = '';
		
		// Check for data-filter attribute (for filter-items)
		if ($item.data('filter')) {
			searchValue = String($item.data('filter') || '').trim();
		}
		// Check for category name (for category-items)
		else if ($item.find('.category-name').length > 0) {
			searchValue = String($item.find('.category-name').text() || '').trim();
		}
		// Check for streamer name (for stream-items)
		else if ($item.find('.streamer').length > 0) {
			searchValue = String($item.find('.streamer').text() || '').trim();
		}
		// Fallback to all text content
		else {
			searchValue = String($item.text() || '').trim();
		}

		if (searchValue && searchValue.toUpperCase().indexOf(filterValue) > -1) {
			$item.show();
		} else {
			$item.hide();
			// Also hide any open dropdowns for hidden items
			const $dropdown = $item.find('.section-dropdown-menu');
			if ($dropdown.length) {
				$dropdown.remove();
			}
		}
	}
	
	// Hide section groups that have no visible/matching items (only for Following Streams)
	if (currentTabCode === 'FollowingStreams') {
		$(currentTab).find('.channel-section').each(function() {
			const $section = $(this);
			const $sectionContent = $section.find('.channel-section-content');
			// Check if section has any visible stream items
			const hasVisibleItems = $sectionContent.find('.stream-item:visible').length > 0;
			
			if (hasVisibleItems) {
				$section.show();
			} else {
				$section.hide();
			}
		});
	}
}

async function initRefresh() {
	$('#refresh').off('click').on('click', async (e) => {
		e.preventDefault();
		e.stopPropagation();
		
		const currentTab = $(".sidebar-button.active")[0];
		if (!currentTab) {
			console.error('No active tab found');
			return;
		}
		
		const tabCode = $(currentTab).data('section-code');
		if (!tabCode) {
			console.error('No tab code found for active tab');
			return;
		}
		
		const refreshIcon = $('#refresh i');

		refreshIcon.addClass('icon-rotate');
		
		// Ensure the correct tab is visible and active
		const tabTarget = $(currentTab).data('target');
		if (tabTarget) {
			// Hide all content tabs first
			$('.content-tab').removeClass('active').hide();
			// Show and activate the correct tab
			$(tabTarget).addClass('active').show();
			
			// Hide all wrappers except the target one (for tabs that use wrappers)
			if (tabCode !== 'Search') {
				const wrapperMapping = {
					'FollowingStreams': '#followingList_Wrapper',
					'TopGames': '#topGameList_Wrapper',
					'TopStreams': '#topStreamList_Wrapper',
					'Settings': '#settings_Wrapper'
				};
				
				const targetWrapper = wrapperMapping[tabCode];
				if (targetWrapper) {
					$("#followingList_Wrapper, #topGameList_Wrapper, #topGameStreamList_Wrapper, #topStreamList_Wrapper").each(function() {
						const wrapperId = targetWrapper.substring(1);
						if (this.id !== wrapperId) {
							$(this).hide();
						} else {
							$(this).show();
						}
					});
				}
			}
		}

		switch (tabCode) {
			case 'FollowingStreams':
				$("#followingListPlaceholder_Wrapper").show();
				$("#followingList_Wrapper").hide();
				await getFollowingList(false); // Don't use cache on refresh

				refreshIcon.removeClass('icon-rotate');
				break;
			case 'TopGames':
				$('#backGames').hide();
				$("#topGameListPlaceholder_Wrapper").show();
				$("#topGameList_Wrapper").hide();
				await getTopGameList(false); // Don't use cache on refresh

				refreshIcon.removeClass('icon-rotate');
				break;
			case 'TopStreams':
				$("#topStreamListPlaceholder_Wrapper").show();
				$("#topStreamList_Wrapper").hide();
				await getTopStreamList(false); // Don't use cache on refresh

				refreshIcon.removeClass('icon-rotate');
				break;
			case 'Search':
				const currentPane = $('.navigation-tab.active')[0];
				const paneCode = $(currentPane).data('type');
				const searchTerm = $('#searchTab').val();
				
				if (searchTerm && searchTerm.trim().length > 0) {
					// Show placeholder while refreshing
					if (paneCode === 'Stream') {
						$("#searchStreamResultPlaceholder_Wrapper").show();
						$("#searchStreamResult_Wrapper").hide();
					} else if (paneCode === 'Category') {
						$("#searchCategoryResultPlaceholder_Wrapper").show();
						$("#searchCategoryResult_Wrapper").hide();
					}
					
					// Re-perform search
					await performSearch(paneCode, searchTerm);
				} else {
					// No search term - just reset to placeholder state
					const searchStreamResult = $('#searchStreamResult_Wrapper');
					const searchCategoryResult = $('#searchCategoryResult_Wrapper');
					
					if (paneCode === 'Stream') {
						searchStreamResult.html('<div class="twitch-go-search-placeholder"><i>Search for your Favorite Streamer...</i></div>');
					} else if (paneCode === 'Category') {
						searchCategoryResult.html('<div class="twitch-go-search-placeholder"><i>Search for your Favorite Game/Category...</i></div>');
					}
				}
				
				// Reset scroll position for search tab (using OverlayScrollbars if available)
				const searchTab = document.querySelector('.content-tab.search');
				if (searchTab && typeof OverlayScrollbarsGlobal !== 'undefined' && typeof OverlayScrollbarsGlobal.OverlayScrollbars !== 'undefined') {
					const searchTabInstance = OverlayScrollbarsGlobal.OverlayScrollbars(searchTab);
					if (searchTabInstance) {
						searchTabInstance.scroll({ y: 0 }, 300);
					}
				} else {
					$('.content-tab.search').scrollTop(0);
				}
				
				refreshIcon.removeClass('icon-rotate');
				break;
			default:
				console.warn(`Refresh not implemented for tab: ${tabCode}`);
				refreshIcon.removeClass('icon-rotate');
				break;
		}

		// Reset scroll position for other tabs
		if (tabCode !== 'Search') {
			$('.twitch-go-content').scrollTop(0);
		}
	});
}

async function getSponsorList() {
	const fetchPromise = await fetch(`${ghostirCore}/Twitch/API/GetSponsorList`);
	const returnedData = await fetchPromise.json();
	
	returnedData.forEach(sponsor => {
		$('#sponsorList_Wrapper').append(`<div class="sponsor-item"><img class="sponsor-item-image" src="${sponsor.twitchSponsorImage}" alt="${sponsor.twitchSponsorName}"><div class="sponsor-item-information"><strong style="font-size: 15px;">${sponsor.twitchSponsorTitle}</strong><span style="font-size: 12px;">${sponsor.twitchSponsorDescription}</span><i>Check them out by clicking <a href="${sponsor.twitchSponsorLink}">here.</a></i></div></div>`);
	});
}

// Persistence functions
async function saveActiveTab(tabCode) {
	await browser.storage.local.set({ 'activeTab': tabCode });
}

async function getActiveTab() {
	const result = await browser.storage.local.get(['activeTab']);
	return result.activeTab || 'FollowingStreams';
}

async function saveScrollPosition(tabCode, scrollTop) {
	const scrollPositions = await getScrollPositions();
	scrollPositions[tabCode] = scrollTop;
	await browser.storage.local.set({ 'scrollPositions': JSON.stringify(scrollPositions) });
}

async function getScrollPositions() {
	const result = await browser.storage.local.get(['scrollPositions']);
	if (result.scrollPositions) {
		try {
			return JSON.parse(result.scrollPositions);
		} catch (e) {
			return {};
		}
	}
	return {};
}