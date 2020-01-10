import { Router } from "express";
import AEError, { sendError } from "../../errors";
import { CONSUMER_KEY, CONSUMER_SECRET } from "../../twitter_const";
import { getCompleteUserFromId, batchUsers, saveTwitterUsers, sanitizeMongoObj, methodNotAllowed, sendTwitterError } from "../../helpers";
import Twitter from '../../twitter_lite_clone/twitter_lite';
import { FullUser } from "twitter-d";
import logger from "../../logger";

//// BULKING USERS (100 max)

const route = Router();

route.post('/', (req, res) => {
  // Download users from twitter
  const fetch_id = req.body && req.body.ids && Array.isArray(req.body.ids);

  if (req.user && req.body && (
    fetch_id
    || (req.body.sns && Array.isArray(req.body.sns))
  )) {
    const ids: string[] = fetch_id ? req.body.ids : req.body.sns;

    // Test if rq is OK
    if (!ids.length) {
      sendError(AEError.invalid_request, res, "Needs users attached to request");
      return;
    }
    if (ids.length > 100) {
      sendError(AEError.invalid_request, res, "Up to 100 users could be agregated in a request.");
      return;
    }

    // Get users from DB or/and Twitter
    (async () => {
      const existings = await batchUsers(ids, !fetch_id);

      const ids_existings = new Set(
        existings.map(e => {
          if (fetch_id) {
            return e.id_str;
          }
          return e.screen_name.toLowerCase();
        })
      );

      // array diff
      const to_retrieve = ids.filter(e => !ids_existings.has(e.toLowerCase()));
      let error = false;

      if (to_retrieve.length) {
        // Max 100 users allowed
        if (to_retrieve.length > 100) {
          sendError(AEError.invalid_request, res);
          return;
        }

        logger.debug(`Batching ${to_retrieve.length} users from Twitter`);

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
        const parameters: any = { include_entities: true };
        if (fetch_id) {
          parameters.user_id = to_retrieve.join(',');
        }
        else {
          parameters.screen_name = to_retrieve.join(',');
        }

        const twitter_users = await user.post('users/lookup', parameters)
          // Save every tweet in mangoose (and catch insert errors)
          .then((users: FullUser[]) => saveTwitterUsers(users).catch(e => {
            logger.error("Unable to save users.", e);
            sendError(AEError.server_error, res);
            error = true;
          }))
          // Otherwise, send Twitter error
          .catch(e => {
            if (e.errors && e.errors[0].code === 17) {
              // No user match, skipping
              return;
            }

            sendTwitterError(e, res);
            error = true;
          });

        if (twitter_users) {
          existings.push(...twitter_users);
        }
      }

      // Send response
      if (!error)
        res.json(existings.map(e => sanitizeMongoObj(e)));
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
