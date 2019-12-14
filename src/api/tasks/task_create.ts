import { Router } from 'express';
import AEError, { sendError } from '../../errors';
import Task, { isValidTaskType } from './Task';
import { methodNotAllowed, getCompleteUserFromId } from '../../helpers';
import logger from '../../logger';
import { MAX_TASK_PER_USER, MAX_TASK_PER_USER_SPECIAL } from '../../constants';

const route = Router();

route.post('/', (req, res) => {    
    (async () => {
        const user = await getCompleteUserFromId(req.user!.user_id);

        if (!user) {
            sendError(AEError.forbidden, res);
            return;
        }

        const tasks = Task.tasksOf(user.user_id);

        if (user.special) {
            // Special allow a derogation to enable more active tasks
            if (tasks.size >= MAX_TASK_PER_USER_SPECIAL) {
                sendError(AEError.too_many_tasks, res);
                return;
            }
        }
        else {
            // Classic user
            if (tasks.size >= MAX_TASK_PER_USER) {
                sendError(AEError.too_many_tasks, res);
                return;
            }
        }

        // IDs are in req.body.ids, splitted by comma
        if (req.body && req.body.ids && typeof req.body.ids === 'string' && req.body.type && isValidTaskType(req.body.type)) {
            const ids = (req.body.ids as string).split(',');

            if (ids.length) {
                logger.info(`Creation of task of type "${req.body.type}" for user @${user.twitter_screen_name}`);

                // Création tâche (elle s'enregistre correctement automatiquement)
                const task = new Task(ids, {
                    user_id: user.user_id,
                    oauth_token: user.oauth_token,
                    oauth_token_secret: user.oauth_token_secret
                }, req.body.type);

                logger.info(`Elements for task #${task.id} : ${ids.length}`);

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
