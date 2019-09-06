import { Router } from 'express';
import AEError, { sendError } from '../../errors';
import Task from './Task';
import { methodNotAllowed, getCompleteUserFromId } from '../../helpers';
import logger from '../../logger';

const route = Router();

route.post('/', (req, res) => {    
    (async () => {
        const user = await getCompleteUserFromId(req.user!.user_id);

        if (!user) {
            sendError(AEError.forbidden, res);
            return;
        }

        // Tweets IDs are in req.body.tweets, splitted by comma
        if (req.body && req.body.tweets && typeof req.body.tweets === 'string') {
            const tweets = (req.body.tweets as string).split(',');

            if (tweets.length) {
                // Création tâche (elle s'enregistre correctement automatiquement)
                const task = new Task(tweets, {
                    user_id: user.user_id,
                    oauth_token: user.oauth_token,
                    oauth_token_secret: user.oauth_token_secret
                });

                res.json({ status: true, task: String(task.id) });
            }
            else {
                sendError(AEError.invalid_data, res);
            }
        }
        else {
            sendError(AEError.invalid_data, res);
        }
    })().catch(e => {
        logger.error('Error:', e);
        sendError(AEError.server_error, res);
    });
});

route.all('/', methodNotAllowed('POST'));

export default route;
