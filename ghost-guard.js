// const constantMock = window.fetch;
// window.fetch = async function(url, options) {
//     let [resource, config ] = url;
//    
//     // Get the parameter in arguments
//     if (typeof url === 'string') {
//         if (url.includes('video-weaver')) {
//             console.log('Ghost - Video Weaver');
//         } else if (url.includes('/api/channel/hls/')) {
//             console.log('Ghost - HLS');
//         } else {
//             console.log('Ghost - Other');
//         }
//     }
//    
//     // Intercept the parameter here 
//     return constantMock.apply(this, url)
// }


const { fetch: realFetch } = window;
window.fetch = async (url, options) => {
    if (typeof url === 'string') {
        console.log("Ghost - Video Weaver")
        if (url.includes('video-weaver')) {
            return new Promise(function(resolve, reject) {
                const processAfter = async function (response) {
                    
                    resolve(response);
                };

                const send = function () {
                    return realFetch(url, options).then(function (response) {
                        processAfter(response);
                    })['catch'](function (err) {
                        reject(err);
                    });
                };

                send();
            });
        } else if (url.includes('/api/channel/hls/')) {
            console.log("Ghost - HLS");
            return new Promise(function(resolve, reject) {
                const processAfter = async function (response) {
                    
                    resolve(response);
                };

                const send = function () {
                    return realFetch(url, options).then(function (response) {
                        processAfter(response);
                    })['catch'](function (err) {
                        reject(err);
                    });
                };

                send();
            });
        } else {
            console.log("Ghost - Other")
        }
    }

    let [resource, config] = url;
    return realFetch.apply(this, [resource, config]);
};