import { Router } from "express";
import { invalidateToken, methodNotAllowed, getTokenInstanceFromString } from "../../helpers";
import logger from "../../logger";
import AEError, { sendError } from "../../errors";

const route = Router();

route.post('/', (req, res) => {
    const token = req.body && req.body.token ? req.body.token : req.user!.jti;

    // Checking the authenticity of desired token
    (async () => {
        const full_token = await getTokenInstanceFromString(token);

        if (!full_token) {
            sendError(AEError.inexistant, res);
            return;
        }
        
        if (full_token.user_id !== req.user!.user_id) {
            sendError(AEError.forbidden, res);
            return;
        }

        const resp = await invalidateToken(token);

        if (resp.ok) {
            logger.debug(`Token ${token} revoked.`);

            res.json({ status: true });
        }
        else {
            sendError(AEError.inexistant, res);
        }
    })().catch(e => {
        sendError(AEError.server_error, res);
        logger.error("Server error", e);
    });
});

route.all('/', methodNotAllowed('POST'));

export default route;
