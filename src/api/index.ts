import express, { Router } from 'express';
import AEError, { sendError } from '../errors';
import task_route from './tasks/index';
import users_route from './users/index';
import batch_route from './batch/index';
import callback_twitter from './users/callback_twitter';
import jwt from 'express-jwt';
import { SECRET_PUBLIC_KEY } from '../constants';
import { JSONWebToken } from '../interfaces';
import { isTokenInvalid } from '../helpers';
import bodyParser from 'body-parser';
import logger from '../logger';
import { IToken } from '../models';

const route = Router();

// Declare jwt use
route.use(
    jwt({ 
        secret: SECRET_PUBLIC_KEY, 
        credentialsRequired: true,
        isRevoked: (res, payload, done) => {
            isTokenInvalid(payload.jti, res)
                .then(is_revoked => { done(null, is_revoked); })
                .catch(e => { logger.error("Unable to check token validity", e); done(e); });
        }
    }).unless(
        { path: ["/api/users/request.json", "/api/users/access.json", "/api/callback_twitter", "/api"] }
    )
);

// Extends Express request
declare module 'express-serve-static-core' {
    interface Request {
      user?: JSONWebToken;
    }
}

// parse application/x-www-form-urlencoded
route.use(bodyParser.urlencoded({ extended: true }));

// parse application/json
route.use(bodyParser.json({ limit: "50mb" }));

// Pas de type system (vieux paquet)
const mongoSanitize = require('express-mongo-sanitize');

// Or, to replace prohibited characters with _, use:
route.use(mongoSanitize({
    replaceWith: '_'
}));

// Defining routers
route.use('/tasks', task_route);
route.use('/users', users_route);
route.use('/batch', batch_route);

route.all('/', (_, res) => {
    sendError(AEError.invalid_route, res);
});

// Catch JWT erros
// Can't be used in router, must be declared in top-level
export function apiErrors(err: any, _: express.Request, res: express.Response, next: Function) {
    logger.debug("Token identification error: " + err.name);

    if (err.name === 'UnauthorizedError') {
        sendError(AEError.invalid_token, res);
    }
    else {
        next(err);
    }
}

// Catch all API invalid routes
route.use((_, res) => {
    sendError(AEError.inexistant, res);
});

export default route;
