import { Router } from "express";
import { getTokensFromUser, sanitizeMongoObj } from "../../helpers";
import logger from "../../logger";
import AEError, { sendError } from "../../errors";

const route = Router();

route.get('/', (req, res) => {
    // Retourne tous les tokens de l'utilisateur actuellement connecté
    const tokens = getTokensFromUser(req.user!.user_id);

    tokens
        .then(u => {
            res.json(u.map(e => sanitizeMongoObj(e)));
        })
        .catch(e => {
            logger.error("Error while fetching tokens:", e);
            sendError(AEError.server_error, res);
        });
});

export default route;
