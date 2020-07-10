import { Router } from "express";
import { getTokensFromUser, sanitizeMongoObj, methodNotAllowed } from "../../helpers";
import logger from "../../logger";
import AEError, { sendError } from "../../errors";
import { IToken } from "../../models";

const route = Router();

route.get('/', (req, res) => {
    // Retourne tous les tokens de l'utilisateur actuellement connecté
    const tokens = getTokensFromUser(req.user!.user_id);

    tokens
        .then(u => {
            const list: IToken[] = u.map(e => sanitizeMongoObj(e));

            for (const e of list) {
                if (e.token === req.user!.jti) {
                    // @ts-ignore
                    e.current = true;
                }
            }

            res.json(list);
        })
        .catch(e => {
            logger.error("Error while fetching tokens:", e);
            sendError(AEError.server_error, res);
        });
});

route.all('/', methodNotAllowed('GET'));

export default route;
