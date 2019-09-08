import { Router } from "express";
import { methodNotAllowed, deleteUser } from "../../helpers";
import logger from "../../logger";
import AEError, { sendError } from "../../errors";
import { users_to_tasks, tasks_to_objects } from "../tasks/Task";

const route = Router();

route.post('/', (req, res) => {
    // WARNING: THIS WILL COMPLETELY DELETE USER
    // AND INVALIDATE ALL HIS TOKENS

    // Cancel every task from user
    const tasks_of_user = users_to_tasks.get(req.user!.user_id);

    if (tasks_of_user) {
        // Copy (because every cancel modify set)
        const tasks = [...tasks_of_user];

        for (const task of tasks) {
            const t = tasks_to_objects.get(task);

            if (t) {
                t.cancel();
            }
        }
    }

    // Delete user
    deleteUser(req.user!.user_id)
        .then(() => {
            res.json({ status: true });
        })
        .catch(e => {
            logger.error("Unable to delete user:", e);
            sendError(AEError.server_error, res);
        });
});

route.all('/', methodNotAllowed('POST'));

export default route;
