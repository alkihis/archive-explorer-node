import { Router } from 'express';
import access from './access';
import request from './request';
import credentials from './credentials';
import twitter_cred from './credentials_twitter';
import tokens from './tokens';
import delete_user from './delete';
import revoke_token from './revoke_token';

const route = Router();

route.use('/request.json', request);
route.use('/access.json', access);
route.use('/credentials.json', credentials);
route.use('/twitter.json', twitter_cred);
route.use('/destroy.json', delete_user);

const token_route = Router();
token_route.use('/show.json', tokens);
token_route.use('/revoke.json', revoke_token);

route.use('/tokens', token_route);

export default route;
