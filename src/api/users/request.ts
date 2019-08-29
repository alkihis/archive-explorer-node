import { Router } from "express";
import twitter from 'twitter-lite';
import { CONSUMER_KEY, CONSUMER_SECRET, CALLBACK_URL } from "../../twitter_const";
import AEError, { sendError } from "../../errors";
import { methodNotAllowed } from "../../helpers";

// Ask a request token

const route = Router();

route.post('/', (_, res) => {
    // req.user will not be accessible here
    // Generating twitter button for client
    const data = (new twitter({ 
        consumer_key: CONSUMER_KEY,
        consumer_secret: CONSUMER_SECRET
    })).getRequestToken(CALLBACK_URL);

    data.then(data => {
        res.json({
            oauth_token: data.oauth_token,
            oauth_token_secret: data.oauth_token_secret,
            url: 'https://api.twitter.com/oauth/authenticate?oauth_token=' + data.oauth_token
        });
    })
    .catch(() => {
        sendError(AEError.server_error, res);
    });
});

route.all('/', methodNotAllowed('POST'));

export default route;
