var userId = null
var accessToken = null;
var clientId = null;
var twitchEndpoint = null;

let userSignedIn = false;
let validationInterval = null;

let cursor = null;
let ghostirCore = 'https://core.ghostir.net'

setTimeout(function () {
	$("#informationWrapper").append('It seems that the Extension is having trouble loading, this could be due to it being Under Maintenance, for the current Status check the <a class="color-twitch" href="https://ghostir.net/Twitch/Status" target="_blank">Twitch Go Status Page</a>.');
}, 5000);

chrome.storage.sync.get(['userSignedIn'], async function(result) {
	userSignedIn = result.userSignedIn
	await validationInformation();

	if (userSignedIn) {
		chrome.storage.sync.get(['accessToken'], async function(result) {
			accessToken = result.accessToken;
			
			await getApplicationHtml();
		});
	} else {
		await signOut();
	}
});

async function validationInformation() {
	var fetchPromise = await fetch(ghostirCore + '/Twitch/GetValidationInformation');
	var returnedData = await fetchPromise.json();

	twitchEndpoint = returnedData.TwitchEndpoint;
	clientId = encodeURIComponent(returnedData.TwitchId);
}

async function getApplicationHtml() {
	var fetchPromise = await fetch(ghostirCore + '/Twitch/GetTwitchHtml');
	var returnedData = await fetchPromise.text();
	
	$("#applicationWrapper").html(returnedData);

	var darkMode = $('#darkMode_Checkbox').is(":checked");
	chrome.storage.sync.get(['darkMode'], async function(result) {
		if(result != undefined) {
			darkMode = result.darkMode;
		}

		if(darkMode) {
			$('#darkMode_Checkbox').prop('checked', true);
			$('#styleTheme').attr('href','./css/themes/dark.css');
		} else {
			$('#darkMode_Checkbox').prop('checked', false);
			$('#styleTheme').attr('href','./css/themes/light.css');
		}
	});
	
	$('#darkMode_Checkbox').on('change', () => {
		var darkMode = $('#darkMode_Checkbox').is(":checked");
		chrome.storage.sync.set({ 'darkMode': darkMode });
		if(darkMode) {
			$('#styleTheme').attr('href','./css/themes/dark.css');
		} else {
			$('#styleTheme').attr('href','./css/themes/light.css');
		}
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
	chrome.storage.sync.set({ 'accessToken': null });
	chrome.storage.sync.set({ 'userSignedIn': false });

	accessToken = null;
	userSignedIn = false;

	var fetchPromise = await fetch(ghostirCore + '/Twitch/GetTwitchLoginHtml');
	var returnedData = await fetchPromise.text();

	$("#applicationWrapper").html(returnedData);

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
		console.log('User already Signed In.');
		$('#signIn_Icon').attr("class", "fa fa-check-circle");
	} else {
		chrome.identity.launchWebAuthFlow({
			url: twitchEndpoint,
			interactive: true
		}, async function (redirect_url) {
			if (chrome.runtime.lastError) {
				$('#signIn_Icon').attr("class", "fa fa-check-circle");
				$('#authError_Wrapper').html('There was an Issue Authenticating with Twitch, view the Extension Status at <a class="color-twitch" href="https://ghostir.net/Twitch/Status" target="_blank">Twitch Go Status Page</a>.');
			} else {
				if (redirect_url === undefined || redirect_url.includes('error=access_denied') || redirect_url.includes('error=redirect_mismatch')) {
					$('#signIn_Icon').attr("class", "fa fa-check-circle");
					$('#authError_Wrapper').html('There was an Issue Authenticating with Twitch, view the Extension Status at <a class="color-twitch" href="https://ghostir.net/Twitch/Status" target="_blank">Twitch Go Status Page</a>.');
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
						chrome.storage.sync.set({ 'accessToken': accessToken });
						chrome.storage.sync.set({ 'userSignedIn': userSignedIn });

						await getApplicationHtml();
						mainFunction();
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
}

async function getCurrentUserId() {
    var fetchPromise = await fetch('https://api.twitch.tv/helix/users', {
        headers: {
            'Authorization': 'Bearer ' + accessToken,
            'Client-Id': clientId
        }
    });

	if (fetchPromise.status === 200) {
		var returnedData = await fetchPromise.json();
		return await returnedData.data[0].id;
	} else {
		await signOut();
	}
}

function isHidden(el) {
    var style = window.getComputedStyle(el);
    return ((style.display === 'none') || (style.visibility === 'hidden'))
}


function initTabSearch() {
	const selectElement = $('#searchTab');

	$('.nav-link').on('shown.bs.tab', () => {
		var  filter, ul, li, a, i, txtValue;
		selectElement.val('');
		filter = selectElement.val().toUpperCase();

		var currentTab = $(".tab-pane.active")[0];
		$('#backGames').hide();
		$('.tab-content').scrollTop(0);

		// ul = $(currentTab).find('.list-group');
		// li = ul.find("a");
		// for (i = 0; i < li.length; i++) {
		// 	var currentListItem = li[i];
		// 	a = $(currentListItem).find(".fw-bold")[0];
		// 	txtValue = a.textContent || a.innerText;

		// 	if (txtValue.toUpperCase().indexOf(filter) > -1) {
		// 		$(currentListItem).show();
		// 	} else {
		// 		$(currentListItem).hide();
		// 	}
		// }

		// var countVisible = 0;
		// for (var i = 0, max = li.length; i < max; i++) {
		// 	if (!isHidden(li[i]))
		// 	{
		// 		countVisible++;
		// 	}
		// }

		// if($(currentTab).find('.more-section')) {
		// 	if (countVisible <= 6) {
		// 		$(currentTab).find('.more-section').removeClass("d-block");
		// 		$(currentTab).find('.more-section').addClass("d-none");
		// 	} else {
		// 		$(currentTab).find('.more-section').removeClass("d-none");
		// 		$(currentTab).find('.more-section').addClass("d-block");
		// 	}
		// }
	});

	selectElement.on('keyup', () => {
		var  filter, ul, li, a, i, txtValue;
		filter = selectElement.val().toUpperCase();

		var currentTab = $(".tab-pane.active")[0];

		ul = $(currentTab).find('.list-group');
		li = ul.find("a");
		for (i = 0; i < li.length; i++) {
			var currentListItem = li[i];
			a = $(currentListItem).find(".fw-bold")[0];
			txtValue = a.textContent || a.innerText;

			if (txtValue.toUpperCase().indexOf(filter) > -1) {
				$(currentListItem).show();
			} else {
				$(currentListItem).hide();
			}
		}

		var countVisible = 0;
		for (var i = 0, max = li.length; i < max; i++) {
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

async function getFollowingList() {
	var cursor = null;
	var fetchPromise = await fetch(ghostirCore + '/Twitch/GetFollowedStreams?authToken=' + accessToken + '&parameterList={"userId":' + '"' + userId + '"}' );
	var returnedData = await fetchPromise.json();

	$("#followingList").html(returnedData.ReturnHtml);
	cursor = returnedData.Cursor;

	// Hides/Shows the More Loading
	var ul = $("#followingList").find('.list-group');
	var li = ul.find("a");
	var countVisible = 0;
	for (var i = 0, max = li.length; i < max; i++) {
		if (!isHidden(li[i]))
		{
			countVisible++;
		}
	}

	if (countVisible <= 6) {
		$("#followingList").find('.more-section').hide();
	} else {
		$("#followingList").find('.more-section').show();
	}

    const onScrollToBottom = $("#followingList").find('.more-section')[0];
    const onIntersection = async ([{isIntersecting}]) => {
        if (isIntersecting && countVisible > 6) {
			if (cursor != undefined) {
				var fetchPromise = await fetch(ghostirCore + '/Twitch/GetFollowedStreams?authToken=' + accessToken + '&parameterList={"userId":"' + userId + '", "cursor":"' + cursor + '"}' );
				var returnedData = await fetchPromise.json();

				if(returnedData.Count > 0) {
					$("#followingList").find('.list-group').append(returnedData.ReturnHtml);
					cursor = returnedData.Cursor;

					if(cursor == null){
						$("#followingList").find('.more-section').remove();
					}
				} else {
					$("#followingList").find('.more-section').remove();
				}
			} else {
				$("#followingList").find('.more-section').remove();
			}
        }
    }

    const io = new IntersectionObserver(onIntersection, {threshold: 1})
    io.observe(onScrollToBottom)
}

async function getTopGameList() {
	var cursor = null;
	var fetchPromise = await fetch(ghostirCore + '/Twitch/GetTopGameList?authToken=' + accessToken);
	var returnedData = await fetchPromise.json();

	$("#topGames").html(returnedData.ReturnHtml);
	cursor = returnedData.Cursor;

	// Hides/Shows the More Loading
	var ul = $("#topGames").find('.list-group');
	var li = ul.find("a");
	var countVisible = 0;
	for (var i = 0, max = li.length; i < max; i++) {
		if (!isHidden(li[i]))
		{
			countVisible++;
		}
	}

	if (countVisible <= 6) {
		$("#topGames").find('.more-section').hide();
	} else {
		$("#topGames").find('.more-section').show();
	}

    const onScrollToBottom = $("#topGames").find('.more-section')[0];
    const onIntersection = async ([{isIntersecting}]) => {
        if (isIntersecting && countVisible > 6) {
			if (cursor != undefined) {
				var fetchPromise = await fetch(ghostirCore + '/Twitch/GetTopGameList?authToken=' + accessToken + '&cursor=' + cursor);
				var returnedData = await fetchPromise.json();

				if(returnedData.Count > 0) {
					$("#topGames").find('.list-group').append(returnedData.ReturnHtml);
					cursor = returnedData.Cursor;

					if(cursor == null){
						$("#topGames").find('.more-section').remove();
					}
				} else {
					$("#topGames").find('.more-section').remove();
				}
			} else {
				$("#topGames").find('.more-section').remove();
			}
        }
    }

    const io = new IntersectionObserver(onIntersection, {threshold: 1})
    io.observe(onScrollToBottom)
}

async function getTopStreamList() {
	var cursor = null;
	var fetchPromise = await fetch(ghostirCore + '/Twitch/GetStreamList?authToken=' + accessToken);
	var returnedData = await fetchPromise.json();

	$("#topStreams").html(returnedData.ReturnHtml);
	cursor = returnedData.Cursor;

	// Hides/Shows the More Loading
	var ul = $("#topStreams").find('.list-group');
	var li = ul.find("a");
	var countVisible = 0;
	for (var i = 0, max = li.length; i < max; i++) {
		if (!isHidden(li[i]))
		{
			countVisible++;
		}
	}

	if (countVisible <= 6) {
		$("#topStreams").find('.more-section').hide();
	} else {
		$("#topStreams").find('.more-section').show();
	}

	var gameButton = $('.gameButton');
	gameButton.on('click', async (event) => {
		let gameId = $(event.currentTarget).data('gameid');

		var fetchPromise = await fetch(ghostirCore + '/Twitch/GetStreamList?authToken=' + accessToken + '&parameterList={"game":' + '"' + gameId + '"}');
		var returnedData = await fetchPromise.json();

		$("#topGamesInner").html(returnedData.ReturnHtml);

		$('#backGames').on('click', () => {
			$("#backGames").hide();

			$('.tab-content').scrollTop(0);
			$('#topGamesInner').scrollTop(0);

			$("#topGames").addClass("show");
			$("#topGames").addClass("active");
			
			$("#topGamesInner").removeClass("show");
			$("#topGamesInner").removeClass("active");

			$("#topGamesInner").html(""); 
		});

		$("#backGames").show();

		$("#topGames").removeClass("show");
		$("#topGames").removeClass("active");
		
		$("#topGamesInner").addClass("show");
		$("#topGamesInner").addClass("active");
	});

    const onScrollToBottom = $("#topStreams").find('.more-section')[0];
    const onIntersection = async ([{isIntersecting}]) => {
        if (isIntersecting && countVisible > 6) {
			if (cursor != undefined) {
				var fetchPromise = await fetch(ghostirCore + '/Twitch/GetStreamList?authToken=' + accessToken + '&parameterList={"cursor":' + '"' + cursor + '"}');
				var returnedData = await fetchPromise.json();

				if(returnedData.Count > 0) {
					$("#topStreams").find('.list-group').append(returnedData.ReturnHtml);
					cursor = returnedData.Cursor;

					if(cursor == null){
						$("#topStreams").find('.more-section').remove();
					}
				} else {
					$("#topStreams").find('.more-section').remove();
				}
			} else {
				$("#topStreams").find('.more-section').remove();
			}
        }
    }

    const io = new IntersectionObserver(onIntersection, {threshold: 1})
    io.observe(onScrollToBottom)
}

async function getSearchList() {
	var searchValue = $('#searchTab').val();
	if(searchValue.length === 0) {
		$('#searchList').html('<div class="text-center p-3"><small><i>Begin Searching for Stream or Games/Categories...</i></small></div>');
	} else {
		var fetchPromise = await fetch(ghostirCore + '/Twitch/GetSearchList?authToken=' + accessToken + '&parameterList={"search":' + '"' + searchValue + '"}');
		var returnedData = await fetchPromise.json();
	
		$('#searchList').html(returnedData.ReturnHtml);
	}

	var typingTimer;
	var doneTypingInterval = 1000;

	$('#searchTab').on('keyup', function () {
		$('#searchList').html('<div class="text-center p-3"><h1 class="fw-light"><i class="fas fa-circle-notch fa-spin" style="color: #772ce8;font-size: 40px;"></i></h1></div>');
		clearTimeout(typingTimer);
		typingTimer = setTimeout(doneTyping, doneTypingInterval);
	});

	$('#searchTab').on('keydown', function () {
		clearTimeout(typingTimer);
	});
	
}

async function doneTyping () {
	var filter;
	filter = $('#searchTab').val().toUpperCase();
	if(filter.length === 0) {
		$('#searchList').html('<div class="text-center p-3"><small><i>Begin Searching for Stream or Games/Categories...</i></small></div>');
	} else {
		var fetchPromise = await fetch(ghostirCore + '/Twitch/GetSearchList?authToken=' + accessToken + '&parameterList={"search":' + '"' + filter + '"}');
		var returnedData = await fetchPromise.json();

		$('#searchList').html(returnedData.ReturnHtml);
	}
}





































// async function getTopGameList() {
// 	var cursor = null;

//     var followingList = await twitchCall('games/top?first=100');
// 	cursor = followingList.pagination.cursor;

// 	var innerHtml = '<div id="topGameList" class="list-group list-group-flush scrollarea ps-1 pt-1">';
// 	followingList.data.forEach(element => {
// 		var thumbnailImage = '<div class="col-3" style="width: 10% !important"><img src="' + element.box_art_url.replace('{width}', '35').replace('{height}', '50') + '" height="50" width="35" alt="Thumbnail"></div>';
// 		innerHtml += '<a href="#" data-gameId="' + element.id + '" class="gameButton list-group-item list-group-item-action p-0">' + 
// 			'<div class="d-flex align-items-center justify-content-between">' +
// 				thumbnailImage +
// 				'<div class="col-9" style="width: 90% !important">' +
// 					'<div class="fw-bold" style="margin-bottom: 5px;">' + element.name + '</div>' +
// 				'</div>' +
// 			'</div>' +
// 		'</a>'
// 	});

// 	innerHtml += '</div><section id="topGameListBottom" class="more-section"><i class="fa-solid fa-circle-notch fa-spin"></i> More</section>';
// 	document.getElementById("topGames").innerHTML = innerHtml

// 	const selectElement = document.querySelector('#searchTab');
// 	selectElement.addEventListener('keyup', (event) => {
// 		var  filter, ul, li, a, i, txtValue;
// 		filter = event.target.value.toUpperCase();
// 		ul = document.getElementById("topGameList");
// 		li = ul.getElementsByTagName("a");
// 		for (i = 0; i < li.length; i++) {
// 			a = li[i].getElementsByClassName("fw-bold")[0];
// 			txtValue = a.textContent || a.innerText;

// 			if (txtValue.toUpperCase().indexOf(filter) > -1) {
// 				li[i].style.display = "";
// 			} else {
// 				li[i].style.display = "none";
// 			}
// 		}

// 		var countVisible = 0;
// 		for (var i = 0, max = li.length; i < max; i++) {
// 			if (!isHidden(li[i]))
// 			{
// 				countVisible++;
// 			}
// 		}

// 		if(document.querySelector('#topGameListBottom')) {
// 			if (countVisible <= 6) {
// 				document.querySelector('#topGameListBottom').classList.remove("d-block");
// 				document.querySelector('#topGameListBottom').classList.add("d-none");
// 			} else {
// 				document.querySelector('#topGameListBottom').classList.remove("d-none");
// 				document.querySelector('#topGameListBottom').classList.add("d-block");
// 			}
// 		}
// 	});

	// document.querySelectorAll('.gameButton').forEach(item => {
	// 	item.addEventListener('click', event => {
	// 		let gameId = event.currentTarget.dataset.gameid;

	// 		fetch('https://api.twitch.tv/helix/streams?game_id=' + gameId + '&first=100', {
	// 			headers: {
	// 				'Authorization': 'Bearer ' + accessToken,
	// 				'Client-Id': clientId
	// 			}
	// 		}).then(res => {
	// 			res.json().then(body => {
	// 				topGamesInner = body;
	// 				var innerHtml = '<div class="list-group list-group-flush scrollarea">';
	// 				topGamesInner.data.forEach(element => {
	// 					var thumbnailImage = '<div class="col-3" style="width: 22% !important"><img src="' + element.thumbnail_url.replace('{width}', '90').replace('{height}', '50') + '" height="50" width="90" alt="Thumbnail"></div>';
	// 					innerHtml += '<a href="https://www.twitch.tv/' + element.user_login + '" target="_blank" class="list-group-item list-group-item-action p-0" style="padding-left: 3px !important;">' + 
	// 						'<div class="d-flex align-items-center justify-content-between">' +
	// 							thumbnailImage +
	// 							'<div class="col-9" style="width: 78% !important">' +
	// 								'<div class="fw-bold" style="margin-bottom: 5px;">' + element.user_name + '</div>' +
	// 								'<div class="small" style="margin-top: -10px;"><small>' + element.game_name + ' <span class="badge bg-danger">' + element.viewer_count + ' viewers</span></small></div>' +
	// 								'<div class="text-truncate small" style="margin-top: -5px;"><small>' + element.title + '</small></div>' +
	// 							'</div>' +
	// 						'</div>' +
	// 					'</a>'
	// 				});
	// 				innerHtml += '</div>'
	// 				document.getElementById("topGamesInner").innerHTML = innerHtml

	// 				document.querySelector('#backGames').addEventListener('click', event => {
						

	// 					document.getElementById("backGames").classList.remove("d-block");
	// 					document.getElementById("backGames").classList.add("d-none");

	// 					document.getElementById("topGames").classList.add("show");
	// 					document.getElementById("topGames").classList.add("active");
						
	// 					document.getElementById("topGamesInner").classList.remove("show");
	// 					document.getElementById("topGamesInner").classList.remove("active");

	// 					document.getElementById("topGamesInner").innerHTML = ''; 
	// 				});
	// 			});
				
	// 			if (res.status === 401) {
	// 				user_signed_in = false;
	// 			}
	// 		}).catch(err => console.log(err));

	// 		document.getElementById("backGames").classList.remove("d-none");
	// 		document.getElementById("backGames").classList.add("d-block");

	// 		document.getElementById("topGames").classList.remove("show");
	// 		document.getElementById("topGames").classList.remove("active");
			
	// 		document.getElementById("topGamesInner").classList.add("show");
	// 		document.getElementById("topGamesInner").classList.add("active");
	// 	});
	// });

// 	const onScrollToBottom = document.querySelector('#topGameListBottom');
//     const onIntersection = async ([{isIntersecting}]) => {
//         if (isIntersecting) {
// 			if (cursor != undefined) {
// 				var innerFollowingList = await twitchCall('games/top?first=100' + '&after=' + cursor);
// 				if(innerFollowingList.data.length > 0) {
// 					cursor = innerFollowingList.pagination.cursor;
				
// 					let innerHtml = '';
				
// 					innerFollowingList.data.forEach(element => {
// 						var thumbnailImage = '<div class="col-3" style="width: 10% !important"><img src="' + element.box_art_url.replace('{width}', '35').replace('{height}', '50') + '" height="50" width="35" alt="Thumbnail"></div>';
// 						innerHtml += '<a href="#" data-gameId="' + element.id + '" class="gameButton list-group-item list-group-item-action p-0">' + 
// 							'<div class="d-flex align-items-center justify-content-between">' +
// 								thumbnailImage +
// 								'<div class="col-9" style="width: 90% !important">' +
// 									'<div class="fw-bold" style="margin-bottom: 5px;">' + element.name + '</div>' +
// 								'</div>' +
// 							'</div>' +
// 						'</a>'
// 					});
					
// 					var container = document.getElementById("topGameList");
// 					container.innerHTML += innerHtml;
// 				} else {
// 					document.querySelector('#topGameListBottom').remove();
// 				}
// 			} else {
// 				document.querySelector('#topGameListBottom').remove();
// 			}
//         }
//     }

//     const io = new IntersectionObserver(onIntersection, {threshold: 1})
//     io.observe(onScrollToBottom)
// }








// chrome.storage.sync.get(['accessToken'], function(result) {
//     console.log(result.accessToken);
//     accessToken = result.accessToken;
//     chrome.storage.sync.get(['clientId'], function(result) {
//         console.log(result.clientId);
//         clientId = result.clientId;


//         fetch('https://api.twitch.tv/helix/users', {
//     headers: {
//         'Authorization': 'Bearer ' + accessToken,
//         'Client-Id': clientId
//     }
// }).then(res => {
//     res.json().then(body => {
//         userId = body.data[0].id;
        
//         fetch('https://api.twitch.tv/helix/streams/followed?user_id=' + userId + '&first=2', {
//             headers: {
//                 'Authorization': 'Bearer ' + accessToken,
//                 'Client-Id': clientId
//             }
//         }).then(res => {
//             res.json().then(body => {
//                 followingList = body;
//                 // var paginationWrapper = '<div class="pagination-wrapper">'
//                 // paginationWrapper += '<button class="btn btn-primary twitch-button me-2"><i class="fa fa-arrow-left"></i> Back</button>'
//                 // paginationWrapper += '<button class="btn btn-primary twitch-button">Next <i class="fa fa-arrow-right"></i></button>'
//                 // paginationWrapper += '</div>';
//                 var innerHtml = '<div class="list-group list-group-flush scrollarea">';
//                 followingList.data.forEach(element => {
//                     var thumbnailImage = '<div class="col-3" style="width: 22% !important"><img src="' + element.thumbnail_url.replace('{width}', '90').replace('{height}', '50') + '" height="50" width="90" alt="Thumbnail"></div>';
//                     innerHtml += '<a href="https://www.twitch.tv/' + element.user_login + '" target="_blank" class="list-group-item list-group-item-action p-0" style="padding-left: 3px !important;">' + 
//                         '<div class="d-flex align-items-center justify-content-between">' +
//                             thumbnailImage +
//                             '<div class="col-9" style="width: 78% !important">' +
//                                 '<div class="fw-bold" style="margin-bottom: 5px;">' + element.user_name + '</div>' +
//                                 '<div class="small" style="margin-top: -10px;"><small>' + '<span class="me-2">' + element.game_name + '</span>' + ' <span class="viewer-color">' + '<i class="fa fa-user"></i> ' + '<strong>' + element.viewer_count + '</strong>' + '</span></small></div>' +
//                                 '<div class="text-truncate small" style="margin-top: -5px;"><small>' + element.title + '</small></div>' +
//                             '</div>' +
//                         '</div>' +
//                     '</a>'
//                 });
//                 innerHtml += '</div><section id="on-scroll-to-bottom">On Scroll to Bottom</section>'
//                 document.getElementById("followingList").innerHTML = innerHtml

//                 console.log(body)

//                 const onScrollToBottom = document.getElementById('on-scroll-to-bottom')

//                 const onIntersection = ([{isIntersecting, target}]) => {
//                     isIntersecting && (target.style.backgroundColor = 'green');

//                     fetch('https://api.twitch.tv/helix/streams/followed?user_id=' + userId + '&first=100' + '&after=' + followingList.pagination.cursor, {
//                         headers: {
//                             'Authorization': 'Bearer ' + accessToken,
//                             'Client-Id': clientId
//                         }
//                     }).then(res => {
//                         res.json().then(body => {
//                             followingList = body;
//                             // var paginationWrapper = '<div class="pagination-wrapper">'
//                             // paginationWrapper += '<button class="btn btn-primary twitch-button me-2"><i class="fa fa-arrow-left"></i> Back</button>'
//                             // paginationWrapper += '<button class="btn btn-primary twitch-button">Next <i class="fa fa-arrow-right"></i></button>'
//                             // paginationWrapper += '</div>';
//                             var innerHtml = '<div class="list-group list-group-flush scrollarea">';
//                             followingList.data.forEach(element => {
//                                 var thumbnailImage = '<div class="col-3" style="width: 22% !important"><img src="' + element.thumbnail_url.replace('{width}', '90').replace('{height}', '50') + '" height="50" width="90" alt="Thumbnail"></div>';
//                                 innerHtml += '<a href="https://www.twitch.tv/' + element.user_login + '" target="_blank" class="list-group-item list-group-item-action p-0" style="padding-left: 3px !important;">' + 
//                                     '<div class="d-flex align-items-center justify-content-between">' +
//                                         thumbnailImage +
//                                         '<div class="col-9" style="width: 78% !important">' +
//                                             '<div class="fw-bold" style="margin-bottom: 5px;">1' + element.user_name + '</div>' +
//                                             '<div class="small" style="margin-top: -10px;"><small>' + '<span class="me-2">' + element.game_name + '</span>' + ' <span class="viewer-color">' + '<i class="fa fa-user"></i> ' + '<strong>' + element.viewer_count + '</strong>' + '</span></small></div>' +
//                                             '<div class="text-truncate small" style="margin-top: -5px;"><small>' + element.title + '</small></div>' +
//                                         '</div>' +
//                                     '</div>' +
//                                 '</a>'
//                             });
//                             innerHtml += '</div><section id="on-scroll-to-bottom">On Scroll to Bottom</section>'
//                             document.getElementById("followingList").innerHTML += innerHtml
//                         });
                        
//                         if (res.status === 401) {
//                             user_signed_in = false;
//                         }
//                     }).catch(err => console.log(err))
//                 }
                
//                 const io = new IntersectionObserver(onIntersection, {threshold: 1})

//                 io.observe(onScrollToBottom)
//             });
            
//             if (res.status === 401) {
//                 user_signed_in = false;
//             }
//         }).catch(err => console.log(err))
//     });
// }).catch(err => console.log(err))

// fetch('https://api.twitch.tv/helix/games/top?first=100', {
//     headers: {
//         'Authorization': 'Bearer ' + accessToken,
//         'Client-Id': clientId
//     }
// }).then(res => {
//     res.json().then(body => {
//         topGames = body;
//         var innerHtml = '<div class="list-group list-group-flush scrollarea ps-1 pt-1">';
//         topGames.data.forEach(element => {
//             var thumbnailImage = '<div class="col-3" style="width: 10% !important"><img src="' + element.box_art_url.replace('{width}', '35').replace('{height}', '50') + '" height="50" width="35" alt="Thumbnail"></div>';
//             innerHtml += '<a href="#" data-gameId="' + element.id + '" class="gameButton list-group-item list-group-item-action p-0">' + 
//                 '<div class="d-flex align-items-center justify-content-between">' +
//                     thumbnailImage +
//                     '<div class="col-9" style="width: 90% !important">' +
//                         '<div class="fw-bold" style="margin-bottom: 5px;">' + element.name + '</div>' +
//                     '</div>' +
//                 '</div>' +
//             '</a>'
//         });
//         innerHtml += '</div>'
//         document.getElementById("topGames").innerHTML = innerHtml
//         document.querySelectorAll('.gameButton').forEach(item => {
//             item.addEventListener('click', event => {
//                 let gameId = event.currentTarget.dataset.gameid;

//                 fetch('https://api.twitch.tv/helix/streams?game_id=' + gameId + '&first=100', {
//                     headers: {
//                         'Authorization': 'Bearer ' + accessToken,
//                         'Client-Id': clientId
//                     }
//                 }).then(res => {
//                     res.json().then(body => {
//                         topGamesInner = body;
//                         var innerHtml = '<div class="list-group list-group-flush scrollarea">';
//                         topGamesInner.data.forEach(element => {
//                             var thumbnailImage = '<div class="col-3" style="width: 22% !important"><img src="' + element.thumbnail_url.replace('{width}', '90').replace('{height}', '50') + '" height="50" width="90" alt="Thumbnail"></div>';
//                             innerHtml += '<a href="https://www.twitch.tv/' + element.user_login + '" target="_blank" class="list-group-item list-group-item-action p-0" style="padding-left: 3px !important;">' + 
//                                 '<div class="d-flex align-items-center justify-content-between">' +
//                                     thumbnailImage +
//                                     '<div class="col-9" style="width: 78% !important">' +
//                                         '<div class="fw-bold" style="margin-bottom: 5px;">' + element.user_name + '</div>' +
//                                         '<div class="small" style="margin-top: -10px;"><small>' + element.game_name + ' <span class="badge bg-danger">' + element.viewer_count + ' viewers</span></small></div>' +
//                                         '<div class="text-truncate small" style="margin-top: -5px;"><small>' + element.title + '</small></div>' +
//                                     '</div>' +
//                                 '</div>' +
//                             '</a>'
//                         });
//                         innerHtml += '</div>'
//                         document.getElementById("topGamesInner").innerHTML = innerHtml

//                         document.querySelector('#backGames').addEventListener('click', event => {
//                             document.getElementById("backGames").classList.remove("d-block");
//                             document.getElementById("backGames").classList.add("d-none");

//                             document.getElementById("topGames").classList.add("show");
//                             document.getElementById("topGames").classList.add("active");
                            
//                             document.getElementById("topGamesInner").classList.remove("show");
//                             document.getElementById("topGamesInner").classList.remove("active");

//                             document.getElementById("topGamesInner").innerHTML = ''; 
//                         });
//                     });
                    
//                     if (res.status === 401) {
//                         user_signed_in = false;
//                     }
//                 }).catch(err => console.log(err));

//                 document.getElementById("backGames").classList.remove("d-none");
//                 document.getElementById("backGames").classList.add("d-block");

//                 document.getElementById("topGames").classList.remove("show");
//                 document.getElementById("topGames").classList.remove("active");
                
//                 document.getElementById("topGamesInner").classList.add("show");
//                 document.getElementById("topGamesInner").classList.add("active");
//             });
//         })
//     });
    
//     if (res.status === 401) {
//         user_signed_in = false;
//     }
// }).catch(err => console.log(err))

// fetch('https://api.twitch.tv/helix/streams?first=100', {
//     headers: {
//         'Authorization': 'Bearer ' + accessToken,
//         'Client-Id': clientId
//     }
// }).then(res => {
//     res.json().then(body => {
//         topStreams = body;
//         var innerHtml = '<div class="list-group list-group-flush scrollarea">';
//         topStreams.data.forEach(element => {
//             var thumbnailImage = '<div class="col-3" style="width: 22% !important"><img src="' + element.thumbnail_url.replace('{width}', '90').replace('{height}', '50') + '" height="50" width="90" alt="Thumbnail"></div>';
//             innerHtml += '<a href="https://www.twitch.tv/' + element.user_login + '" target="_blank" class="list-group-item list-group-item-action p-0" style="padding-left: 3px !important;">' + 
//                 '<div class="d-flex align-items-center justify-content-between">' +
//                     thumbnailImage +
//                     '<div class="col-9" style="width: 78% !important">' +
//                         '<div class="fw-bold" style="margin-bottom: 5px;">' + element.user_name + '</div>' +
//                         '<div class="small" style="margin-top: -10px;"><small>' + element.game_name + ' <span class="badge bg-danger">' + element.viewer_count + ' viewers</span></small></div>' +
//                         '<div class="text-truncate small" style="margin-top: -5px;"><small>' + element.title + '</small></div>' +
//                     '</div>' +
//                 '</div>' +
//             '</a>'
//         });
//         innerHtml += '</div>'
//         document.getElementById("topStreams").innerHTML = innerHtml
//     });
    
//     if (res.status === 401) {
//         user_signed_in = false;
//     }
// }).catch(err => console.log(err))
//     });
// });






