import { Router } from 'express';
import create_task from './task_create';
import task_info from './task_infos';
import task_delete from './task_stop';

const route = Router();

route.use('/create.json', create_task);
route.use('/details', task_info);
route.use('/destroy', task_delete);

export default route;
