import { Router } from 'express';
import AEError, { sendError } from '../../errors';
import { methodNotAllowed } from '../../helpers';
import Task from './Task';

const route = Router();

route.get('/all.json', (req, res) => {
    // récupérer user ID via token
    const user_id = req.user!.user_id;

    const tasks = Task.tasksOf(user_id);
    
    // Répertorie toutes les tâches de l'utilisateur et renvoie leur progression actuelle
    res.json([...tasks].map(t => t!.current_progression));
});

route.all('/all.json', methodNotAllowed('GET'));

route.get('/:id.json', (req, res) => {
    if (req.params.id) {
        // récupérer user ID via token
        const user_id = req.user!.user_id;

        // Recherche la tâche :id
        try {
            var id = BigInt(req.params.id);
        } catch (e) {
            // Invalid conversation
            sendError(AEError.invalid_request, res);
            return;
        }

        const task = Task.get(id);

        if (task) {
            if (task.owner === user_id) {
                res.json(task.current_progression);
            }
            else {
                sendError(AEError.forbidden, res);
            }
        }
        else {
            sendError(AEError.inexistant, res);
        }
    }
    else {
        sendError(AEError.invalid_request, res);
    }
});

route.all('/:id.json', methodNotAllowed('GET'));

export default route;