import { Router } from 'express';
import AEError, { sendError } from '../../errors';
import { tasks_to_objects, users_to_tasks } from './Task';
import { methodNotAllowed } from '../../helpers';

const route = Router();

route.get('/all.json', (req, res) => {
    // récupérer user ID via token
    const user_id = req.user!.user_id;

    const user_tasks = users_to_tasks.get(user_id);
    
    // Répertorie toutes les tâches de l'utilisateur et renvoie leur progression actuelle
    if (user_tasks) {
        res.json([...user_tasks].map(t => tasks_to_objects.get(t)).filter(t => t).map(t => t!.current_progression));
    }
    else {
        res.json([]);
    }
});

route.all('/all.json', methodNotAllowed('GET'));

route.get('/:id.json', (req, res) => {
    if (req.params.id) {
        // récupérer user ID via token
        const user_id = req.user!.user_id;

        // Recherche la tâche :id
        const id = BigInt(req.params.id);

        const user_tasks = users_to_tasks.get(user_id);
        
        // Si l'utilisateur peut accéder à cette tâche
        if (user_tasks && user_tasks.has(id)) {
            const task = tasks_to_objects.get(id);

            if (task) {
                res.json(task.current_progression);
            }
            else {
                sendError(AEError.inexistant, res);
            }
        }
        else {
            // Tâche non autorisée
            sendError(AEError.forbidden, res);
        }
    }
    else {
        sendError(AEError.invalid_request, res);
    }
});

route.all('/:id.json', methodNotAllowed('GET'));

export default route;