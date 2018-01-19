var AWS = require('aws-sdk'),
    fs  = require('fs'),
    Q   = require('q');

Q.longStackSupport = true;

var s3 = new AWS.S3({
    accessKeyId: process.env.AWS_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_S3_SECRET_ACCESS_KEY,
    region: process.env.AWS_S3_REGION,
    apiVersion: process.env.AWS_API_VERSION
});

function storeUsers(users, next) {
    var params = {Bucket: s3Bucket, Key: s3Key, Body: JSON.stringify(users)};
    s3.putObject(params, function (err, data) {
        if (err) throw err;
        next();
    })
}

function getLastRepoUsers(next) {
    var params = {Bucket: s3Bucket, Key: s3Key};
    s3.getObject(params, function (err, data) {
        if (err && err.code == 'NoSuchKey') {
            next(null);
            return;
        }
        else if (err) throw err;
        next(JSON.parse(data.Body.toString()));
    })
}

function sendFileToS3(path, key) {
    var deferred = Q.defer();
    fs.readFile(path, function (err, data) {
        var params = {Bucket: process.env.AWS_S3_REPORT_BUCKET, Key: key, Body: data};

        s3.upload(params, function (err, data) {
            if (err) {
                deferred.reject(err);
            } else {
                deferred.resolve();
            }
        });
    });

    return deferred.promise;
}

function getFileFromS3(key){
    var deferred = Q.defer();
    var s3Params = {Bucket: process.env.AWS_S3_REPORT_BUCKET, Key: key};
    s3.getObject(s3Params, function (err, data) {
        if (err) {
            deferred.reject(err);
        }
        else {
            deferred.resolve(data.Body.toString());
        }
    });

    return deferred.promise
}

module.exports = {
    sendFileToS3 : sendFileToS3,
    getFileFromS3: getFileFromS3
};
