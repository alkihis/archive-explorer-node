import { Router } from 'express';
import AEError, { sendError } from '../../errors';
import Task from './Task';
import { methodNotAllowed } from '../../helpers';

const route = Router();

route.post('/', (req, res) => {
    // TODO Authentificate user...
    const user_id = "";
    
    // Tweets IDs are in req.body.tweets, splitted by comma
    if (req.body && req.body.tweets && typeof req.body.tweets === 'string') {
        const tweets = (req.body.tweets as string).split(',');

        if (tweets.length) {
            // Création tâche (elle s'enregistre correctement automatiquement)
            const task = new Task(tweets, user_id);

            res.json({ status: true, task: String(task.id) });
        }
        else {
            sendError(AEError.invalid_data, res);
        }
    }
    else {
        sendError(AEError.invalid_data, res);
    }
});

route.all('/', methodNotAllowed('POST'));

export default route;
