import { Router } from "express";
import AEError, { sendError } from "../../errors";
import { CONSUMER_KEY, CONSUMER_SECRET } from "../../twitter_const";
import { getCompleteUserFromId, batchUsers, saveTwitterUsers, sanitizeMongoObj, methodNotAllowed, sendTwitterError } from "../../helpers";
import Twitter from '../../twitter_lite_clone/twitter_lite';
import { FullUser } from "twitter-d";
import logger from "../../logger";

//// BULKING USERS (100 max)
const user_ids_that_dont_exists = new Set<string>();
const screen_names_that_dont_exists = new Map<string, Date>();

// reset ID set every 24 hours
setInterval(() => {
  user_ids_that_dont_exists.clear();
}, 1000 * 60 * 60 * 24);

// Clear not found screen names set every hour
setInterval(() => {
  const entries = [...screen_names_that_dont_exists.entries()];
  // Minimal date to validate, 5 days ago
  const threshold = new Date().getTime() - (1000 * 60 * 60 * 24 * 5);
  for (const [sn, date] of entries) {
    if (date.getTime() < threshold) {
      screen_names_that_dont_exists.delete(sn);
    }
  }
}, 1000 * 60 * 60);

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
    if (!ids.every(e => typeof e === 'string' && e.length < 32)) {
      sendError(AEError.invalid_request, res, "Users should be representated with strings of length < 32 chars");
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
      let to_retrieve = ids.map(e => e.toLowerCase()).filter(e => !ids_existings.has(e));
      let error = false;

      if (fetch_id) {
        to_retrieve = to_retrieve.filter(id => !user_ids_that_dont_exists.has(id));
      }
      else {
        // fetch screen name
        to_retrieve = to_retrieve.filter(screen_name => !screen_names_that_dont_exists.has(screen_name));
      }

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

        // Check which ones does not exists
        if (fetch_id) {
          // Find users to retrieve that are not in 
          const retrieved = new Set((twitter_users || []).map(e => e.id_str));
          const not_found = to_retrieve.filter(id => !retrieved.has(id));

          if (not_found.length) {
            logger.debug(`${not_found.length} users has been marqued as not found.`);
            for (const e of not_found) {
              user_ids_that_dont_exists.add(e);
            }
          }
        }
        else {
          // fetch screen name : find users to retrieve that are not in 
          const retrieved = new Set((twitter_users || []).map(e => e.screen_name));
          const not_found = to_retrieve.filter(sn => !retrieved.has(sn));

          if (not_found.length) {
            logger.debug(`${not_found.length} users has been marqued as not found.`);
            for (const e of not_found) {
              screen_names_that_dont_exists.set(e, new Date);
            }
          }
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
