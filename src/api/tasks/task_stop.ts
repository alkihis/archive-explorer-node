import { Router } from 'express';
import AEError, { sendError } from '../../errors';
import { methodNotAllowed } from '../../helpers';
import Task from './Task';

const route = Router();

// Arrêter toutes les tâches
route.post('/all.json', (req, res) => {
    // Récupérer user ID via token
    const user_id = req.user!.user_id;

    const user_tasks = Task.tasksOf(user_id);

    // Si l'utilisateur a des tâches
    for (const t of user_tasks) {
        t.cancel();
    }

    res.send();
});

route.all('/all.json', methodNotAllowed('GET'));

// Arrêter une tâche par ID
route.post('/:id.json', (req, res) => {
    if (req.params.id) {
        const user_id = req.user!.user_id;

        try {
            var id = BigInt(req.params.id);
        } catch (e) {
            sendError(AEError.invalid_data, res);
            return;
        }

        // Recherche si la tâche existe
        const task = Task.get(id);

        if (!task) {
            sendError(AEError.inexistant, res);
            return;
        }

        if (task!.owner !== user_id) {
            sendError(AEError.forbidden, res);
            return;
        }

        task!.cancel();

        res.json();
    }
    else {
        sendError(AEError.invalid_data, res);
    }
});

route.all('/:id.json', methodNotAllowed('POST'));

export default route;