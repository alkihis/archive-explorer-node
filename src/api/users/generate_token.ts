import { Router } from "express";
import logger from "../../logger";
import AEError, { sendError } from "../../errors";

const route = Router();

route.post('/', (req, res) => {
    // Génère un nouveau token pour l'utilisateur connecté

    // PEUT CAUSER DDOS, PAS DEV POUR LE MOMENT
});

export default route;
