import { Router } from "express";
import { getCompleteUserFromId, sanitizeMongoObj, methodNotAllowed } from "../../helpers";
import logger from "../../logger";
import AEError, { sendError } from "../../errors";
import { CONFIG_FILE } from "../../constants";

const route = Router();

route.get('/', (req, res) => {
    // Retourne des infos sur l'utilisateur connecté
    const user = getCompleteUserFromId(req.user!.user_id);

    user
        .then(u => {
            if (u) {
                const s_user = sanitizeMongoObj(u);
                s_user.can_cloud = CONFIG_FILE.allowed_users_to_cloud.includes(u.user_id);
                res.json(s_user);
            }
            else {
                sendError(AEError.forbidden, res);
            }
        })
        .catch(e => {
            logger.error("Error while fetching user:", e);
            sendError(AEError.server_error, res);
        });
});

route.all('/', methodNotAllowed('GET'));

export default route;
