var functions = require('firebase-functions');
var PubSub = require('@google-cloud/pubsub');

exports.rawVideoNotifier = functions.storage.object().onChange(event => {
  if (!event.name.startsWith('raw-videos/')) {
    console.log('Not a video to be encoded');
    return;
  } else {
    var pubSub = PubSub();
    console.log(pubSub);
  }
});
