const notionAPICallWithRetry = (notionAPICall, numberOfRetry) => {
    return new Promise((resolve, reject) => {
        let attempts = 1;
        const fetchRetry = (times) => {
            return notionAPICall
                .then((res) => {
                    // TODO: to make it generalized not only for Notion API responses
                    if (res.results && res.results.length > 0) {
                        console.log(
                            `Successfully fetched with attempts: ${attempts}`
                        );
                        return resolve(res);
                    } else if (times === 1) {
                        throw reject(
                            `Couldn't get results with ${attempts} attempts. Notion may not be ready yet.`
                        );
                    } else {
                        console.log(`No results. Retry with delay 10s, the current attempts: ${attempts}`);
                        setTimeout(() => {
                            attempts++;
                            fetchRetry(times - 1);
                        }, 10000);
                    }
                })
                .catch((error) => {
                    if (times === 1) {
                        reject(error);
                    } else {
                        console.log(`Error occurred. Retry with delay 10s, the current attempts: ${attempts}`);
                        setTimeout(() => {
                            attempts++;
                            fetchRetry(times - 1);
                        }, 10000);
                    }
                });
        };
        return fetchRetry(numberOfRetry);
    });
};

export { notionAPICallWithRetry as default };
