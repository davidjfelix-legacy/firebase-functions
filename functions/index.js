var functions = require('firebase-functions');
var PubSub = require('@google-cloud/pubsub');

exports.rawVideoNotifier = functions.storage.object().onChange(event => {
  console.log(event);
  if (!event.data.name.startsWith('raw-videos/')) {
    console.log('Not a video to be encoded');
    return;
  } else {
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
