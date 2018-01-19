var crypto = require('crypto'),
    Q = require('q'),
    mailgun = require('mailgun-js')({
        apiKey: process.env.MAILGUN_API_KEY,
        domain: process.env.MAILGUN_DOMAIN
    });

function isWebhookVerified(timestamp, token, signature) {
    var candidate = timestamp + token;
    var hmac = crypto.createHmac('sha256', process.env.MAILGUN_API_KEY);

    hmac.update(candidate);

    return hmac.digest('hex') == signature;
}

function sendEmail(to, subject, htmlMessage) {
    var deferred = Q.defer();
    var data = {
        from: process.env.EMAIL_FROM,
        to: to,
        subject: subject,
        html: htmlMessage
    };
    mailgun.messages().send(data, function (err, _) {
        if (err) {
            deferred.reject(err);
        } else {
            deferred.resolve();
        }
    });

    return deferred.promise;
}

module.exports = {
    isWebhookVerified: isWebhookVerified,
    sendEmail: sendEmail
};
