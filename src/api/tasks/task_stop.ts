import { Router } from 'express';
import { tasks_to_objects, users_to_tasks } from './Task';
import AEError, { sendError } from '../../errors';

const route = Router();

// Arrêter toutes les tâches
route.get('/all.json', (_, res) => {
    // TODO check récupérer user ID via token

    const user_id = "";

    const user_tasks = users_to_tasks.get(user_id);

    // Si l'utilisateur a des tâches
    if (user_tasks && user_tasks.size) {
        for (const t of user_tasks) {
            const task = tasks_to_objects.get(t);

            if (task) {
                task.cancel();
            }
            else {
                tasks_to_objects.delete(t);
            }
        }
    }

    res.send();
});

// Arrêter une tâche par ID
route.post('/:id.json', (req, res) => {
    if (req.params.id) {
        // TODO Check user token and get user id...
        const user_id = "";

        try {
            var id = BigInt(req.params.id);
        } catch (e) {
            sendError(AEError.invalid_data, res);
            return;
        }

        // Recherche si la tâche existe
        if (!tasks_to_objects.has(id)) {
            sendError(AEError.inexistant, res);
            return;
        }
        
        const task = tasks_to_objects.get(id);

        if (task!.owner !== user_id) {
            sendError(AEError.forbidden, res);
            return;
        }

        task!.cancel();

        res.send();
    }
    else {
        sendError(AEError.invalid_data, res);
    }
});

export default route;