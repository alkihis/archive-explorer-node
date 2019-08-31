import { Router } from "express";
import tweets from './tweets';
import users from './users';

const route = Router();

route.use('/tweets.json', tweets);
route.use('/users.json', users);

export default route;
