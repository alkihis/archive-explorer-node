import { Router } from "express";
import AEError, { sendError } from "../../errors";
import { batchTweets, getCompleteUserFromId, saveTweets, sanitizeMongoObj } from "../../helpers";
import Twitter from 'twitter-lite';
import { CONSUMER_KEY, CONSUMER_SECRET } from "../../twitter_const";
import { Status } from "twitter-d";

//// BULKING TWEETS (100 max)

const route = Router();

route.post('/', (req, res) => {
  // Download tweets from twitter
  if (req.user && req.body && req.body.ids && Array.isArray(req.body.ids)) {
    const ids: string[] = req.body.ids;

    // Test if rq is OK
    if (!req.body.ids.length) {
      sendError(AEError.invalid_request, res, "Needs tweets attached to request");
      return;
    }
    if (req.body.ids.length > 100) {
      sendError(AEError.invalid_request, res, "Up to 100 tweets could be agregated in a request.");
      return;
    }

    // Get tweets from DB or/and Twitter
    (async () => {
      const existings = await batchTweets(ids);

      const ids_existings = new Set(existings.map(e => e.id_str));

      // array diff
      const to_retrieve = ids.filter(e => !ids_existings.has(e));

      if (to_retrieve.length) {
        const bdd_user = await getCompleteUserFromId(req.user!.user_id);

        // If user does not exists
        if (!bdd_user) {
          sendError(AEError.invalid_token, res);
          return;
        }

        // Create Twitter object with credentials
        const user = new Twitter({ 
          consumer_key: CONSUMER_KEY,
          consumer_secret: CONSUMER_SECRET,
          access_token_key: bdd_user.oauth_token,
          access_token_secret: bdd_user.oauth_token_secret
        });

        // Batch tweets using lookup endpoint (100 max)
        const twitter_tweets = await user.post('statuses/lookup', { id: to_retrieve.join(','), include_entities: true })
          // Save every tweet in mangoose (and catch insert errors)
          .then((statuses: Status[]) => saveTweets(statuses).catch(() => sendError(AEError.server_error, res)))
          // Otherwise, send Twitter error
          .catch(e => sendError(AEError.twitter_error, res, e));

        if (!twitter_tweets) {
          return;
        }

        existings.push(...twitter_tweets);
      }

      // Send response
      res.json(existings.map(e => sanitizeMongoObj(e)));
    })().catch(e => {
      console.log("Batch error", e);
      sendError(AEError.server_error, res);
    });
  }
  else {
    sendError(AEError.invalid_request, res);
  }
});

export default route;
