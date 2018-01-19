var express = require('express');
var app = express();
var path = require('path');
var url = require('url');
var uuid = require('uuid');
var ejs = require('ejs');
var bodyParser = require('body-parser');
var Q = require('q');
var stripe = require("stripe")(
    process.env.STRIPE_SECRET_KEY
);

Q.longStackSupport = true;

var reportBuilder = require('./report-builder');
var ghService = require('./gh-service');
var s3Service = require('./s3-service');
var analytics = require('./analytics');
var mailService = require('./mail-service');

app.engine('ejs.html', ejs.renderFile);
app.set('view engine', 'ejs.html');
app.set('views', path.join(__dirname, 'views'));

app.use('/static', express.static('static'));

app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

app.get('/', function (req, res) {
    res.redirect('/github');
});

app.get('/subscribe', function(req, res) {
 res.render('index', {segmentKey: process.env.SEGMENT_WRITE_KEY});
});

app.get('/github', function (req, res) {
    res.render('github-form', {segmentKey: process.env.SEGMENT_WRITE_KEY});
});

app.get('/thanks', function (req, res) {
    res.render('github-thanks', {segmentKey: process.env.SEGMENT_WRITE_KEY});
});

app.get('/summary/:id', function (req, res, next) {
    reportBuilder.getSummary(req.params.id)
        .then(function (summary) {
            res.render('summary', {
                segmentKey: process.env.SEGMENT_WRITE_KEY,
                stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
                summary:summary});
        })
        .catch(function (err) {
            console.log(err);
            next(new Error("Summary not found"));
        })
        .done();
});

app.get('/report/:id', function (req, res, next) {
    reportBuilder.getReport(req.params.id)
        .then(function (reportData) {
            res.attachment('report.csv');
            res.send(reportData);
        })
        .catch(function (err) {
            console.log(err);
            next(new Error("Report not found"));
        })
        .done();
});

app.post('/github', function (req, res, next) {
    var repo = url.parse(req.body['github-url']).pathname.substr(1);
    var email = req.body.email;
    var reportId = uuid.v4();
    var summaryId = uuid.v4();
    var anonymousId = analytics.anonymousId();

    var errorHandler = function (err) {
        analytics.githubReportFailure(anonymousId, email, repo, err);
        console.trace(err, err.stack);
    };

    var onCompletion = function (result) {
        analytics.githubReportSuccess(anonymousId, email, repo);
        console.log('DONEZO!', result);
    };

    ghService.getRepoCommunity(repo)
        .then(function (users) {
            var createAndSendFullReport = reportBuilder.createCsvReport(users)
                .then(function (reportPath) {
                    return s3Service.sendFileToS3(reportPath, 'report-' + reportId)
                });
            var createAndSendSummary = reportBuilder.createReportSummary(users, reportId, summaryId)
                .then(function (summaryPath) {
                    return s3Service.sendFileToS3(summaryPath, 'summary-' + summaryId);
                });

            return [createAndSendFullReport, createAndSendSummary];
        })
        .all()
        .thenResolve([email, summaryId])
        .spread(reportBuilder.sendSummaryEmail)
        .then(onCompletion)
        .catch(errorHandler)
        .done();

    analytics.requestGithubReport(anonymousId, email, repo);
    res.redirect('/thanks');
});

app.get('/oops', function (req, res) {
    res.render('error', {segmentKey: process.env.SEGMENT_WRITE_KEY});
});

app.post('/payment', function (req, res) {
    var anonymousId = analytics.anonymousId();
    analytics.recordChargeAttempt(anonymousId, req.body.summaryId);
    reportBuilder.getSummary(req.body.summaryId)
        .then(function (summary) {
            return stripe.charges.create({
                amount: summary.price,
                currency: 'USD',
                source: req.body.token,
                description: 'GitHub community report'
            }).then(function (charge) {
                console.log('stripe charge', charge);
                analytics.recordSuccessfulCharge(anonymousId, req.body.summaryId, charge);
                res.send({path: '/report/' + summary.reportId})
            });
        })
        .catch(function (err) {
            console.error(err);
            analytics.recordFailedCharge(anonymousId, req.body.summaryId, err);
            res.status(400).send({path: '/oops'});
        })
        .done();
});

app.post('/mail-event', function(req, res){
    if (mailService.isWebhookVerified(req.body.timestamp, req.body.token, req.body.signature)){
        analytics.trackMailEvent(analytics.anonymousId(), req.body.event, red.body);
        res.end();
    } else {
        res.status(403).end();
    }
});

app.use(function (err, req, res, next) {
  console.trace('Unhandled error: ', err);
  res.render('error', { status: 500, error: err, segmentKey: process.env.SEGMENT_WRITE_KEY });
});

app.use(function (req, res, next) {
  res.render('404', { status: 404, url: req.url, segmentKey: process.env.SEGMENT_WRITE_KEY });
});

var port = process.env.PORT || 3000;
var server = app.listen(port, function () {
    var host = server.address().address;
    var port = server.address().port;

    console.log('Example app listening at http://%s:%s', host, port);
});
