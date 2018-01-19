var uuid = require('node-uuid');
var analytics = new require('analytics-node')(process.env.SEGMENT_WRITE_KEY, { flushAt: 1 });

function requestGithubReport(anonymousId, email, repo){
  //TODO add some validation on required fields
  analytics.track({
    anonymousId: anonymousId,
    event: 'request-github-report',
    properties: {
      repo: repo,
      email: email
    }
  });
}

function githubReportFailure(anonymousId, email, repo, error){
  //TODO add some validation on required fields
  analytics.track({
    anonymousId: anonymousId,
    event: 'github-report-failure',
    properties: {
      repo: repo,
      email: email,
      error: error
    }
  });
}

function githubReportSuccess(anonymousId, email, repo){
  //TODO add some validation on required fields
  analytics.track({
    anonymousId: anonymousId,
    event: 'github-report-success',
    properties: {
      repo: repo,
      email: email
    }
  });
}

function recordChargeAttempt(anonymousId, summaryId){
  analytics.track({
    anonymousId: anonymousId,
    event: 'github-report-charge-attempt',
    properties: {
      summaryId: summaryId
    }
  });
}

function recordSuccessfulCharge(anonymousId, summaryId, charge){
  analytics.track({
    anonymousId: anonymousId,
    event: 'github-report-successful-charge',
    properties: {
      summaryId: summaryId,
      charge: charge
    }
  });
}

function recordFailedCharge(anonymousId, summaryId, error){
  analytics.track({
    anonymousId: anonymousId,
    event: 'github-report-failed-charge',
    properties: {
      summaryId: summaryId,
      error: error
    }
  });
}

function trackMailEvent(anonymousId, eventName, eventData){
  analytics.track({
    anonymousId: anonymousId,
    event: 'mailgun-event-' + eventName,
    properties: eventData
  });
}

module.exports = {
  anonymousId: uuid.v4,
  identify: analytics.identify,
  requestGithubReport: requestGithubReport,
  githubReportFailure: githubReportFailure,
  githubReportSuccess: githubReportSuccess,
  recordChargeAttempt: recordChargeAttempt,
  recordSuccessfulCharge: recordSuccessfulCharge,
  recordFailedCharge: recordFailedCharge,
  trackMailEvent: trackMailEvent
};
