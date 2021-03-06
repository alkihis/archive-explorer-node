import { Router } from "express";
import AEError, { sendError } from "../../errors";
import { batchTweets, getCompleteUserFromId, methodNotAllowed, sendTwitterError, suppressUselessTweetProperties } from "../../helpers";
import Twitter from '../../twitter_lite_clone/twitter_lite';
import { CONSUMER_KEY, CONSUMER_SECRET } from "../../twitter_const";
import { Status } from "twitter-d";
import logger from "../../logger";

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
    if (!ids.every(e => typeof e === 'string' && e.length < 32)) {
      sendError(AEError.invalid_request, res, "Tweet IDs should be representated with strings of length < 32 chars");
      return;
    }

    // Get tweets from DB or/and Twitter
    (async () => {
      const existings = await batchTweets(ids) as any as Status[];

      const ids_existings = new Set(existings.map(e => e.id_str));

      // array diff
      let to_retrieve = ids.filter(e => !ids_existings.has(e))

      let error = false;

      if (to_retrieve.length) {
        // Max 100 tweets allowed
        if (to_retrieve.length > 100) {
          sendError(AEError.invalid_request, res);
          return;
        }

        logger.debug(`Batching ${to_retrieve.length} tweets from Twitter`);

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
        const twitter_tweets = await user.post('statuses/lookup', {
          id: to_retrieve.join(','),
          include_entities: true,
          tweet_mode: "extended"
        })
          // Otherwise, send Twitter error
          .catch(e => {
            sendTwitterError(e, res);
            error = true;
          }) as Status[];

        if (twitter_tweets) {
          existings.push(...twitter_tweets);
        }
      }

      // Send response
      if (!error)
        res.json(existings.map(e => suppressUselessTweetProperties(e)));
    })().catch(e => {
      logger.error("Batch error", e);
      sendError(AEError.server_error, res);
    });
  }
  else {
    sendError(AEError.invalid_request, res);
  }
});

route.all('/', methodNotAllowed('POST'));

export default route;
