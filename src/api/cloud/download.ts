import { Router } from "express";
import { deleteCloudedArchive, methodNotAllowed } from "../../helpers";
import AEError, { sendError } from '../../errors';
import logger from '../../logger';
import { CloudedArchiveModel, ICloudedArchive } from '../../models';
import * as fs from 'fs';
import { UPLOAD_PATH } from "../../uploader";

const DownloadArchiveCloud = Router();

DownloadArchiveCloud.get('/archive/:file_id', (req, res) => {
    const file_id = String(req.params.file_id);

    if (!file_id) {
        return sendError(AEError.invalid_data, res);
    }

    (async () => {
        const archive_info = await CloudedArchiveModel.findOne({ file_id }) as ICloudedArchive;

        if (!archive_info || archive_info.user_id !== req.user!.user_id) {
            return sendError(AEError.inexistant, res);
        }

        const filepath = UPLOAD_PATH + '/' + archive_info.path;
        const filename = archive_info.filename;

        res.setHeader('Content-Type', 'application/zip');
        res.attachment(filename);
        fs.createReadStream(filepath, { autoClose: true }).pipe(res);
    })().catch(e => {
        sendError(AEError.server_error, res);
        logger.error("Server error", e);
    });
});

DownloadArchiveCloud.all('/archive/:file_id', methodNotAllowed('GET'));

DownloadArchiveCloud.get('/list.json', (req, res) => {
    (async () => {
        const files = await CloudedArchiveModel.find({ user_id: req.user!.user_id }) as ICloudedArchive[];

        res.json({
            files: files.map(f => ({
                id: f.file_id,
                name: f.filename,
                info: f.info,
                date: f.date.toISOString(),
            })),
        });
    })().catch(e => {
        sendError(AEError.server_error, res);
        logger.error("Server error", e);
    });
});

DownloadArchiveCloud.all('/list.json', methodNotAllowed('GET'));

DownloadArchiveCloud.delete('/destroy/:file_id', (req, res) => {
    (async () => {
        const file = await CloudedArchiveModel.findOne({
            user_id: req.user!.user_id,
            file_id: req.params.file_id,
        }) as ICloudedArchive;

        if (file) {
            await deleteCloudedArchive(file);
        }

        res.send();
    })().catch(e => {
        sendError(AEError.server_error, res);
        logger.error("Server error", e);
    });
});

DownloadArchiveCloud.all('/destroy/:file_id', methodNotAllowed('DELETE'));

export default DownloadArchiveCloud;
