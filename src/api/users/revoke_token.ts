import { Router } from "express";
import { invalidateToken } from "../../helpers";
import logger from "../../logger";
import AEError, { sendError } from "../../errors";

const route = Router();

route.post('/', (req, res) => {
    if (!req.body || !req.body.token) {
        sendError(AEError.invalid_request, res);
        return;
    }
    
    const token = req.body.token;
    const resp = invalidateToken(token);

    resp
        .then(d => {
            if (d.ok) {
                res.json({ status: true });
            }
            else {
                sendError(AEError.inexistant, res);
            }
        })
        .catch(e => {
            logger.error("Server Mongo error:", e);
            sendError(AEError.server_error, res);
        });
});

export default route;
