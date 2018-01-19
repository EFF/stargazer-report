var request = require('request'),
    parse = require('parse-link-header'),
    merge = require('merge'),
    _ = require('underscore'),
    Q = require('q');

Q.longStackSupport = true;

var GH_API_RATE_LIMIT_HEADER = 'x-ratelimit-reset';
var GH_API_BASE_URL = 'https://api.github.com/';
var GH_API_REQUEST_CONFIGS = {
    headers: {
        'User-Agent': process.env.GITHUB_CLIENT_UA,
        'Accept': 'application/vnd.github.v3.star+json'
    },
    secrets: {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET
    }
};

function _getRequestOptions(url, queryStringParams) {
    return {
        url: url,
        headers: GH_API_REQUEST_CONFIGS.headers,
        qs: merge(GH_API_REQUEST_CONFIGS.secrets, queryStringParams)
    };
}

function _extractWaitTimeFromResponse(res) {
    var resetTime = res.headers[GH_API_RATE_LIMIT_HEADER];
    var resetDate = new Date(resetTime * 1000);
    var elasped = resetDate - new Date();
    return (1 + Math.ceil(elasped / 1000)) * 1000;
}

function _addUsersToDictionary(userDictionary, users) {
    _.forEach(users, function (user) {
        userDictionary[user.id] = user
    });

    return userDictionary;
}

function _mergeUsersAndMissingRecords(records, users) {
    users.map(function (u, index) {
        merge(u, records[index]);
    });

    return users;
}

function _updateUserDictionary(userDictionary, records) {
    var missingRecords = [];
    _.forEach(records, function (record) {
        if (userDictionary[record.id]) {
            merge(userDictionary[record.id], record);
        } else {
            missingRecords.push(record);
        }
    });

    if (missingRecords.length) {
        var absentUsernames = _.pluck(missingRecords, 'login');
        return getUsers(absentUsernames)
            .then(_mergeUsersAndMissingRecords.bind(this, missingRecords))
            .then(_addUsersToDictionary.bind(this, userDictionary))
    } else {
        return userDictionary;
    }
}

function _toPublicArray(userDictionary) {
    return _.map(userDictionary, function (user) {
        return {
            username: user.login,
            name: user.name,
            company: user.company,
            blog: user.blog,
            location: user.location,
            email: user.email,
            hireable: user.hireable,
            bio: user.bio,
            public_repos: user.public_repos,
            public_gists: user.public_gists,
            followers: user.followers,
            following: user.following,
            created_at: user.created_at,
            updated_at: user.updated_at,
            html_url: user.html_url,
            avatar_url: user.avatar_url,
            is_stargazers: !!user.starred_at,
            starred_at: user.starred_at,
            isIssueCreator: !!user.numberOfIssues,
            numberOfIssues: user.numberOfIssues || 0
        }
    })
}

function _processGHResponse(err, res, body, callerDeferred, callerRetry, callerArgs) {
    if (err) {
        console.trace(err, err.stack);
        callerDeferred.reject({err: err});
    } else if (res.statusCode === 403) {
        var waitTime = _extractWaitTimeFromResponse(res);
        return Q.delay(null, waitTime).then(function () {
            return Q.fapply(callerRetry, callerArgs)
        });
    } else if (res.statusCode >= 400) {
        callerDeferred.reject({status: res.statusCode, err: err});
    } else {
        return JSON.parse(body);
    }
}

function getStargazers(repo, page, resultArray) {
    console.log('getStargazers', repo, page);
    var deferred = Q.defer();
    var url = GH_API_BASE_URL + 'repos/' + repo + '/stargazers';
    var options = _getRequestOptions(url, {page: page});
    var args = arguments;

    request(options, function (err, response, body) {
        Q.fcall(_processGHResponse, err, response, body, deferred, getStargazers, args)
            .then(function (stargazers) {
                var stars = stargazers.map(function (s) {
                    return {starred_at: s.starred_at, login: s.user.login, id: s.user.id}
                });
                resultArray = resultArray.concat(stars);
                var parsed = parse(response.headers.link);
                if (typeof parsed !== 'undefined' && parsed != null && parsed.next) {
                    getStargazers(repo, page + 1, resultArray).then(deferred.resolve(resultArray));
                } else {
                    deferred.resolve(resultArray);
                }
            })
    });

    return deferred.promise;
}

function getUsers(usernames) {
    var userPromises = usernames.map(function (u) {
        return getFullUser(u);
    });

    return Q.all(userPromises)
}

function getFullUser(username) {
    console.log('getFullUser', username)
    var deferred = Q.defer();
    var url = GH_API_BASE_URL + 'users/' + username;
    var options = _getRequestOptions(url, {});
    var args = arguments;

    request(options, function (err, response, body) {
        Q.fcall(_processGHResponse, err, response, body, deferred, getFullUser, args)
            .then(function (user) {
                deferred.resolve(user);
            });
    });

    return deferred.promise;
}

//TODO maybe add more data from issues
function getIssuers(repo) {
    console.log('getIssuers', repo);
    var deferred = Q.defer();
    var url = GH_API_BASE_URL + 'repos/' + repo + '/issues';
    var options = _getRequestOptions(url);
    var args = arguments;

    request(options, function (err, response, body) {
        Q.fcall(_processGHResponse, err, response, body, deferred, getIssuers, args)
            .then(function (issues) {
                var issuers = _.pluck(issues, 'user');
                var countOfIssuesByUser = _.countBy(issuers, 'id');
                var results = _.chain(issuers).uniq('id').map(function (u) {
                    u.numberOfIssues = countOfIssuesByUser[u.id];
                    return u;
                }).value();

                deferred.resolve(results);
            });
    });

    return deferred.promise;
}

function getRepoCommunity(repo) {
    var userDictionary = {};
    return getStargazers(repo, 1, [])
        .then(_updateUserDictionary.bind(this, userDictionary))
        .then(getIssuers.bind(this, repo))
        .then(_updateUserDictionary.bind(this, userDictionary))
        .then(_toPublicArray.bind(this, userDictionary));
}

module.exports = {
    getStargazers: getStargazers,
    getUsers: getUsers,
    getUser: getFullUser,
    getIssuers: getIssuers,
    getRepoCommunity: getRepoCommunity
};
