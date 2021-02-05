import { Response, Router } from 'express';
import { methodNotAllowed } from "../../helpers";
import uploader, { ChunkManager, ChunkManifest, MAX_ALLOWED_CHUNKS, MAX_CLOUDED_ARCHIVES, UploadManager, UPLOAD_PATH } from '../../uploader';
import AEError, { sendError } from '../../errors';
import logger from '../../logger';
import { CloudedArchiveModel } from '../../models';
import md5File from 'md5-file';
import { CONFIG_FILE } from '../../constants';
import path from 'path';

const UploadArchiveCloud = Router();

UploadArchiveCloud.get('/allowed.json', (_, res) => {
    res.json({
        allowed: CONFIG_FILE.allowed_users_to_cloud,
    });
});

UploadArchiveCloud.all('/allowed.json', methodNotAllowed('GET'));

UploadArchiveCloud.post('/start.json', (req, res) => {
    const size = Number(req.body.size);
    const filename = req.body.filename;
    const info = req.body.info;

    if (!size || size < 0 || !filename) {
        return sendError(AEError.invalid_data, res);
    }
    if (typeof info !== 'object') {
        return sendError(AEError.invalid_data, res);
    }
    const allowed_users = CONFIG_FILE.allowed_users_to_cloud as string[];
    if (!allowed_users.includes(req.user!.user_id)) {
        console.log(`User ${req.user!.user_id} is not allowed to register cloud archives.`);
        return sendError(AEError.forbidden, res);
    }

    (async () => {
        const existing_count = await CloudedArchiveModel.countDocuments({ user_id: req.user!.user_id }) as number;
        if (existing_count >= MAX_CLOUDED_ARCHIVES) {
            return sendError(AEError.forbidden, res);
        }

        const existing_hash = await CloudedArchiveModel.countDocuments({
            user_id: req.user!.user_id,
            'info.hash': info.hash,
        }) as number;
        if (existing_hash) {
            return res.json({
                already_sent: true,
            });
        }

        const manifest = await ChunkManager.registerManifest(size, filename, info);

        res.json({
            id: manifest.id,
        });
    })().catch(e => {
        sendError(AEError.server_error, res);
        logger.error("Server error", e);
    });
});

UploadArchiveCloud.all('/start.json', methodNotAllowed('POST'));

UploadArchiveCloud.post('/chunk.json', uploader.single('chunk'), (req, res) => {
    function errorAndCleanup(error: AEError, res: Response) {
        sendError(error, res);
        UploadManager.cleanup(chunk);
    }

    const allowed_users = CONFIG_FILE.allowed_users_to_cloud as string[];
    if (!allowed_users.includes(req.user!.user_id)) {
        return sendError(AEError.forbidden, res);
    }

    const chunk = req.file;
    const file_id = req.body.file_id;
    const chunk_id = Number(req.body.chunk_id);

    if (!file_id || isNaN(chunk_id) || file_id.includes('/')) {
        return errorAndCleanup(AEError.invalid_data, res);
    }

    (async () => {
        const manager = new ChunkManager(file_id);
        let manifest: ChunkManifest;

        try {
            manifest = await manager.getManifest();
        } catch (e) {
            return sendError(AEError.inexistant, res);
        }

        if (manifest.chunks.length >= MAX_ALLOWED_CHUNKS) {
            return sendError(AEError.too_many_chunks, res);
        }

        const chunk_path = manager.getChunkPath(chunk_id.toString());

        if (manifest.chunks.includes(chunk_path)) {
            return sendError(AEError.forbidden, res);
        }

        manifest.chunks.push(chunk_path);
        await manager.saveManifest(manifest);

        // Store the file
        try {
            await UploadManager.copyTo(chunk, chunk_path);
        } catch (e) {
            manifest.chunks = manifest.chunks.slice(0, manifest.chunks.length - 1);
            // Might overwrite changes...
            manager.saveManifest(manifest);

            sendError(AEError.server_error, res);
            logger.error("Server error", e);
            return;
        }

        manifest.sent_size += chunk.size;
        await manager.saveManifest(manifest);

        res.json({
            id: manifest.id,
        });
    })().catch(e => {
        sendError(AEError.server_error, res);
        logger.error("Server error", e);
    }).finally(() => UploadManager.cleanup(chunk));
});

UploadArchiveCloud.all('/chunk.json', methodNotAllowed('POST'));

UploadArchiveCloud.post('/terminate.json', (req, res) => {
    const allowed_users = CONFIG_FILE.allowed_users_to_cloud as string[];
    if (!allowed_users.includes(req.user!.user_id)) {
        return sendError(AEError.forbidden, res);
    }

    const file_id = req.body.file_id;

    if (!file_id || file_id.includes('/')) {
        return sendError(AEError.invalid_data, res);
    }

    (async () => {
        const manager = new ChunkManager(file_id);
        let manifest: ChunkManifest;

        try {
            manifest = await manager.getManifest();
        } catch (e) {
            return sendError(AEError.inexistant, res);
        }

        if (manifest.sent_size !== manifest.size) {
            return sendError(AEError.size_mismatch, res);
        }

        // Reconstruct original file
        const final_path = await manager.reconstructFile(manifest);
        const hash = await md5File(path.normalize(UPLOAD_PATH + '/' + final_path));

        // Register file into mongodb
        await CloudedArchiveModel.create({
            file_id,
            user_id: req.user!.user_id,
            filename: manifest.name,
            path: final_path,
            hash,
            date: new Date(),
            info: manifest.info,
        });

        res.json({
            status: 'ok',
            id: file_id,
            name: manifest.name,
        });
    })().catch(e => {
        sendError(AEError.server_error, res);
        logger.error("Server error", e);
    });
});

UploadArchiveCloud.all('/terminate.json', methodNotAllowed('POST'));

export default UploadArchiveCloud;
