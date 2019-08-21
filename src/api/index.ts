import express, { Router } from 'express';
import AEError, { sendError } from '../errors';
import task_route from './tasks/index';
import jwt from 'express-jwt';
import { SECRET_SIGNER_JWT } from '../constants';

const route = Router();

// Declare jwt use
route.use(
    jwt(
        { secret: SECRET_SIGNER_JWT, credentialsRequired: true }
    ).unless(
        { path: ["/users/request.json"] }
    )
);

// Extends Express request
declare module 'express-serve-static-core' {
    interface Request {
      user?: string
    }
    // interface Response {
    //   myField?: string
    // }
}

route.use('/tasks', task_route);

route.all('/', (_, res) => {
    sendError(AEError.invalid_route, res);
});

// Catch JWT erros
// Can't be used in router, must be declared in top-level
export function apiErrors(err: any, _: express.Request, res: express.Response, next: Function) {
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
