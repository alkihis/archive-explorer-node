import { Router } from "express";
import { methodNotAllowed, deleteUser } from "../../helpers";
import logger from "../../logger";
import AEError, { sendError } from "../../errors";
import Task from "../tasks/Task";

const route = Router();

route.post('/', (req, res) => {
    // WARNING: THIS WILL COMPLETELY DELETE USER
    // AND INVALIDATE ALL HIS TOKENS

    // Cancel every task from user
    const tasks_of_user = Task.tasksOf(req.user!.user_id);

    for (const task of tasks_of_user) {
        task.cancel();
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
