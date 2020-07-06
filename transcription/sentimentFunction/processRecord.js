/*
  Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
  Permission is hereby granted, free of charge, to any person obtaining a copy of this
  software and associated documentation files (the "Software"), to deal in the Software
  without restriction, including without limitation the rights to use, copy, modify,
  merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
  permit persons to whom the Software is furnished to do so.
  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
  INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
  PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
  HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
  OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
  SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

/* jshint esversion: 8 */
/* jshint -W033 */

var path = require('path');
const AWS = require('aws-sdk')
AWS.config.region = process.env.AWS_REGION
const comprehend = new AWS.Comprehend()
const s3 = new AWS.S3()
const documentClient = new AWS.DynamoDB.DocumentClient()

const LanguageCode = 'en'

const processRecord = async (record) => {
    // Load JSON object
    const response = await s3.getObject({
        Bucket: record.s3.bucket.name,
        Key: record.s3.object.key
    }).promise()

    // Extract the transcript
    const originalText = JSON.parse(response.Body.toString('utf-8'))
    const TextOriginal = originalText.results.transcripts[0].transcript
    const Text = TextOriginal.substring(0, Math.min(4098, TextOriginal.length))

    // Do sentiment analysis
    console.log('Transcript: ', Text)

    const sentiment = await comprehend.detectSentiment({
        LanguageCode,
        Text
    }).promise()
    console.log(`Sentiment result ${JSON.stringify(sentiment, null, 2)}`)

    const keyphrases = await comprehend.detectKeyPhrases({
        LanguageCode,
        Text
    }).promise()
    console.log(`Key Phrases result ${JSON.stringify(keyphrases, null, 2)}`)

    const entities = await comprehend.detectEntities({
        LanguageCode,
        Text
    }).promise()
    console.log(`Entities result ${JSON.stringify(entities, null, 2)}`)

    const created = Math.floor(Date.now() / 1000)

    // Store in DynamoDB
    const params = {
        TableName: process.env.DDBtable,
        Item: {
            partitionKey: record.s3.object.key,
            transcript: TextOriginal,
            created,
            Sentiment: sentiment.Sentiment,
            KeyPhrases: keyphrases.KeyPhrases,
            Entities: entities.Entities,
            Positive: sentiment.SentimentScore.Positive,
            Negative: sentiment.SentimentScore.Negative,
            Neutral: sentiment.SentimentScore.Neutral,
            Mixed: sentiment.SentimentScore.Mixed
        }
    }
    await documentClient.put(params).promise()

    // Store in Elasticsearch
    const doc = {
        recordingId: record.s3.object.key,
        transcript: TextOriginal,
        created,
        Sentiment: sentiment.Sentiment,
        KeyPhrases: keyphrases.KeyPhrases,
        Entities: entities.Entities,
        Positive: sentiment.SentimentScore.Positive,
        Negative: sentiment.SentimentScore.Negative,
        Neutral: sentiment.SentimentScore.Neutral,
        Mixed: sentiment.SentimentScore.Mixed
    }

    // Return promise to map in event handler
    return postDocumentToESPromisified(JSON.stringify(doc))
}

const postDocumentToESPromisified = async (doc) => {

    return new Promise((resolve, reject) => {
        var esDomain = {
            endpoint: process.env.es_host,
            region: process.env.AWS_REGION,
            index: 'audioarchive',
            doctype: 'recording'
        }

        var endpoint = new AWS.Endpoint(esDomain.endpoint)
        var creds = new AWS.EnvironmentCredentials('AWS')
        var req = new AWS.HttpRequest(endpoint)

        req.method = 'POST'
        req.path = path.join('/', esDomain.index, esDomain.doctype)
        req.region = esDomain.region
        req.body = doc
        req.headers['presigned-expires'] = false
        req.headers['Host'] = endpoint.host

        // Sign the request (Sigv4)
        var signer = new AWS.Signers.V4(req, 'es')
        signer.addAuthorization(creds, new Date())

        // Post document to ES
        var send = new AWS.NodeHttpClient()
        send.handleRequest(req, null, function (httpResp) {
            var body = ''
            httpResp.on('data', (chunk) => {
                body += chunk
            })
            httpResp.on('end', (chunk) => {
                console.log(body)
                resolve('Success')
            });
        }, function (err) {
            console.log('Error: ' + err);
            reject(err)
        })
    })
}

module.exports = {
    processRecord
}