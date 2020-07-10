import { Router } from "express";
import { getCompleteUserFromId, sanitizeMongoObj, methodNotAllowed, sendTwitterError } from "../../helpers";
import logger from "../../logger";
import AEError, { sendError } from "../../errors";
import Twitter from '../../twitter_lite_clone/twitter_lite';
import { CONSUMER_KEY, CONSUMER_SECRET } from "../../twitter_const";

const route = Router();

route.get('/', (req, res) => {
    // Retourne des infos sur l'utilisateur connecté
    const user = getCompleteUserFromId(req.user!.user_id);

    (async () => {
        const u = await user;

        if (u) {
            // Check Twitter credentials
            const twi = new Twitter({
                consumer_key: CONSUMER_KEY,
                consumer_secret: CONSUMER_SECRET,
                access_token_key: u.oauth_token,
                access_token_secret: u.oauth_token_secret
            });

            try {
                const resp = await twi.get('account/verify_credentials');
                delete resp._headers;
                res.json({ user: sanitizeMongoObj(u), twitter: resp });
            } catch (e) {
                sendTwitterError(e, res);
            }
        }
        else {
            sendError(AEError.forbidden, res);
        }
    })().catch(e => {
        logger.error("Error while fetching user:", e);
        sendError(AEError.server_error, res);
    });
    
        
});

route.all('/', methodNotAllowed('GET'));

export default route;
