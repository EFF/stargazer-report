var tmp = require('tmp'),
    Q = require('q'),
    csv = require('fast-csv'),
    fs = require('fs'),
    _ = require('underscore'),
    ejs = require('ejs'),
    s3Service = require('./s3-service'),
    mailService = require('./mail-service');

Q.longStackSupport = true;

var LOWER_BOUND = 250;
var UPPER_BOUND = 1000;
var FLAT_PRICE_BELOW_LOWER_BOUND = 20;
/*
 getLastRepoUsers(function (lastUsers) {
 var newUsers = [];
 var adds = [];
 var rems = [];
 getSubscribers(repo, 1, newUsers, function (newUsers) {
 if (lastUsers != null) {
 var l = _.map(lastUsers, function (i) {
 return i.user.login;
 });
 var n = _.map(newUsers, function (i) {
 return i.user.login;
 });
 rems = _.uniq(_.difference(l, n));
 adds = _.uniq(_.difference(n, l));
 }

 storeUsers(newUsers, function () {
 var event = {
 starsCount: newUsers.length,
 addCount: adds.length,
 removeCount: rems.length,
 adds: adds,
 rems: rems
 };
 keen.addEvent('REPO_' + keenRepo, event, function (err, res) {
 if (err) {
 console.log(err);
 }
 console.log('Done');
 });
 });
 });
 });
 */

function createCsvReport(users) {
    var deferred = Q.defer();
    tmp.file({keep: true, prefix: 'report', postfix: '.csv'}, function (err, path, _, __) {
        if (err) {
            deferred.reject(err);
            return;
        }
        var ws = fs.createWriteStream(path);
        csv
            .write(users, {headers: true})
            .pipe(ws)
            .on("finish", function () {
                deferred.resolve(path);
            });
    });

    return deferred.promise;
}

function getPricing(usersCount) {
    var price = 0;
    if (usersCount <= LOWER_BOUND) {
        price = FLAT_PRICE_BELOW_LOWER_BOUND;
    } else if (usersCount > LOWER_BOUND && usersCount <= UPPER_BOUND) {
        price = LOWER_BOUND / UPPER_BOUND * usersCount;
    } else {
        price = Math.round(LOWER_BOUND + 625 * Math.log(usersCount / UPPER_BOUND));
    }
    return price * 100; // to get it in ¢
}

function createReportSummary(users, reportId, summaryId) {
    //TODO add email user and repo in summary data.
    //TODO eventually store that in database instead.
    //TODO pass the price as arguments
    var deferred = Q.defer();
    var usersCount = users.length;
    var emailsCount = 0;
    var secondLevelNetworkSize = 0;

    //not super sexy but he, for loops are more efficient than .forEach and .map
    for (var i = 0; i < usersCount; i++) {
        var user = users[i];
        if (user.email) emailsCount++;
        secondLevelNetworkSize += user.followers
    }

    tmp.file({keep: true, postfix: '.json', prefix: 'summary'}, function (err, path, fd, _) {
        if (err) {
            deferred.reject(err);
            return;
        }
        var summary = {
            summaryId: summaryId,
            totalUsers: usersCount,
            totalEmails: emailsCount,
            emailRatio: Math.round((emailsCount / usersCount) * 100),
            secondLevelNetworkSize: secondLevelNetworkSize,
            reportId: reportId,
            price: getPricing(usersCount)
        };

        fs.write(fd, JSON.stringify(summary), function (err) {
            if (err) {
                deferred.reject(err);
            }
            else {
                deferred.resolve(path);
            }
        });
    });

    return deferred.promise;
}

function sendSummaryEmail(email, summaryId) {
    var summaryUrl = process.env.BASE_URL + '/summary/' + summaryId;
    // TODO: pass the summary instead of retrieving it from S3
    var template = fs.readFileSync(__dirname + '/views/summary-email.ejs.html', 'ascii');

    return getSummary(summaryId)
        .then(function (summary) {
            summary.summaryUrl = summaryUrl;
            var htmlMessage = ejs.render(template, summary);
            return mailService.sendEmail(email, 'Your Midman report is ready', htmlMessage);
        });
}

function getSummary(summaryId) {
    var fileKey = 'summary-' + summaryId;
    return s3Service.getFileFromS3(fileKey).then(function (strSummary) {
        return JSON.parse(strSummary)
    });
}

function getReport(reportId) {
    var fileKey = 'report-' + reportId;
    return s3Service.getFileFromS3(fileKey);
}

module.exports = {
    createCsvReport: createCsvReport,
    createReportSummary: createReportSummary,
    sendSummaryEmail: sendSummaryEmail,
    getSummary: getSummary,
    getReport: getReport
};
