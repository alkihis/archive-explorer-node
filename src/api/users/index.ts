import { Router } from 'express';
import access from './access';
import request from './request';

const route = Router();

route.use('/request.json', request);
route.use('/access.json', access);

export default route;
