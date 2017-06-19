const functions = require('firebase-functions');
const admin = require('firebase-admin');
const PubSub = require('@google-cloud/pubsub');

exports.rawVideoNotifier = functions.storage.object().onChange(event => {
  console.log(event);
  if (event.data.name.startsWith('raw-videos/')) {
    console.log('Raw video to be encoded');
    var pubSub = PubSub();
    console.log(pubSub);
    pubSub.topic('raw-videos')
      .get(
        {autoCreate: true},
        function(err, topic, apiResponse) {
          console.log(apiResponse);
          topic.publish(event.data, function(err, messageIds, apiResponse) {
            console.log(messageIds);
            console.log(apiResponse);
          });
        });
  }
});

exports.videoNotifier = functions.storage.object().onChange(event => {
  console.log(event);
  if (event.data.name.startsWith('videos/')) {
    console.log('A video to be added');
  }
});

exports.videos = functions.https.onRequest((req, resp) => {
  console.log(req)
  if (req.method !== 'GET') {
    resp.status(405).send(); // TODO: error object?
    return;
  }

});