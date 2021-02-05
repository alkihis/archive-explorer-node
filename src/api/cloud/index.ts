import { Router } from 'express';
import UploadArchiveCloud from './upload';
import DownloadArchiveCloud from './download';

const CloudRouter = Router();

CloudRouter.use('/upload', UploadArchiveCloud);
CloudRouter.use('/download', DownloadArchiveCloud);

export default CloudRouter;
