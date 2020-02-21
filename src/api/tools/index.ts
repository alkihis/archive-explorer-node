import { Router } from 'express';
import BaseArchiveRouter from './archive';

const ToolsRouter = Router();

ToolsRouter.use('/archive', BaseArchiveRouter);

export default ToolsRouter;
