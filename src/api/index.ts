import express, { Router } from 'express';
import AEError, { sendError } from '../errors';
import task_route from './tasks/index';
import users_route from './users/index';
import batch_route from './batch/index';
import { TweetCounter } from '../constants';
import { JSONWebToken } from '../interfaces';
import bodyParser from 'body-parser';
import logger from '../logger';
import cookieParser from 'cookie-parser';
import jwt from './jwt';
import ToolsRouter from './tools';

const route = Router();

route.use(cookieParser());

// Declare jwt use
route.use(jwt);

route.use((req, res, next) => {
    if (req.__ask_refresh__) {
        res.setHeader('X-Upgrade-Token', req.__ask_refresh__);
        delete req.__ask_refresh__;
    }
    next();
});

// Extends Express request
declare module 'express-serve-static-core' {
    interface Request {
      user?: JSONWebToken;
      __ask_refresh__?: string;
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
route.use('/tools', ToolsRouter);
route.get('/deleted_count.json', (_, res) => {
    res.json({ count: TweetCounter.count });
});

route.all('/', (_, res) => {
    sendError(AEError.invalid_route, res);
});

// Catch JWT erros
// Can't be used in router, must be declared in top-level
export function apiErrors(err: any, _: express.Request, res: express.Response, next: Function) {
    logger.debug("An error occurred: " + err.name);
    logger.verbose(err.stack);

    if (err.name === 'UnauthorizedError') {
        logger.debug("Token identification error: " + err.name);
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
