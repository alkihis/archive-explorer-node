import { Router } from "express";
import AEError, { sendError } from "../../errors";
import { getCompleteUserFromId, methodNotAllowed } from "../../helpers";
import Twitter from '../../twitter_lite_clone/twitter_lite';
import { CONSUMER_KEY, CONSUMER_SECRET } from "../../twitter_const";
import logger from "../../logger";
import { Request, Response } from 'express';

//// PROXY A DM IMAGE

const route = Router();

async function getImageFromUrl(url: string, req: Request, res: Response) {
    if (!url.startsWith('https://ton.twitter.com/dm/')) {
        sendError(AEError.invalid_request, res);
        return;
    }

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

    // Send response
    const resp = await user.dmImage(url);

    if (!resp.ok) {
        if (resp.status === 404) {
            sendError(AEError.inexistant, res);
        }
        else {
            sendError(AEError.twitter_error, res);
        }
        return;
    }

    const headers_to_copy = ['Content-Type', 'Transfer-Encoding'];
    for (const header of headers_to_copy) {
        if (resp.headers.has(header)) {
            res.setHeader(header, resp.headers.get(header) as string);
        }
    }

    const buffer = await resp.arrayBuffer();
    res.send(Buffer.from(buffer));
}

route.get('/', (req, res) => {
    // Download a single image from Twitter
    if (req.user && req.query && req.query.url) {
        const url: string = req.query.url as string;

        // Get URL from Twitter
        getImageFromUrl(url, req, res).catch(e => {
            logger.error("Fetch error", e);
            sendError(AEError.server_error, res);
        });
    }
    else {
        sendError(AEError.invalid_request, res);
    }
});

route.post('/', (req, res) => {
    // Download a single image from Twitter
    if (req.user && req.body && req.body.url) {
        const url: string = req.body.url;

        // Get URL from Twitter
        getImageFromUrl(url, req, res).catch(e => {
            logger.error("Fetch error", e);
            sendError(AEError.server_error, res);
        });
    }
    else {
        sendError(AEError.invalid_request, res);
    }
});

route.all('/', methodNotAllowed(['GET', 'POST']));

export default route;
