import { Router } from 'express';
import BaseArchiveRouter from './archive';

const ToolsRouter = Router();

ToolsRouter.use('/archive.json', BaseArchiveRouter);

export default ToolsRouter;
