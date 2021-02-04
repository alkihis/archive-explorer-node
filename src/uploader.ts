import multer from 'multer';
import { mkdirSync, promises as fs } from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';

export const MAX_CLOUDED_ARCHIVES = 10;
export const UPLOAD_PATH = __dirname + '/../uploads/';
try {
    mkdirSync(UPLOAD_PATH, { recursive: true });
} catch {}

export const uploader = multer({
    dest: UPLOAD_PATH,
    limits: { fileSize: 1024 * 1024 },
});
export default uploader;

export class UploadManager {
    static cleanup(file: Express.Multer.File | Express.Multer.File[]) {
        if (!file) {
            return;
        }

        if (Array.isArray(file)) {
            return file.map(f => fs.unlink(f.path).catch(() => {}));
        }
        else {
            return fs.unlink(file.path).catch(() => {});
        }
    }

    static copyTo(file: Express.Multer.File, name: string) {
        const dirname = path.dirname(file.path);
        const newpath = path.normalize(dirname + '/' + name);

        return fs.copyFile(file.path, newpath).then(() => {
            file.path = newpath
        });
    }
}

export interface ChunkManifest {
    id: string;
    size: number;
    sent_size: number;
    chunks: string[];
    name: string;
    info: any;
}

export class ChunkManager {
    constructor(protected file_id: string) {}

    static getNewFileId() {
        return uuid();
    }

    async reconstructFile(manifest: ChunkManifest) {
        let i = 0;
        const indexed_chunks: [number, string][] = manifest.chunks.map(e => [this.getChunkIndex(e), e]);
        const sorted_chunks = indexed_chunks.sort((a, b) => {
            return a[0] - b[0];
        });
        const final_path = path.normalize(UPLOAD_PATH + '/' + this.file_id + '.zip');

        for (const [chunk_index, chunk_name] of sorted_chunks) {
            if (chunk_index !== i) {
                throw new RangeError('Index order does not match');
            }

            // Append chunk to final file
            await fs.appendFile(final_path, await fs.readFile(chunk_name));

            i++;
        }

        // Ok, file reconstructed
        // Remove every chunk + manifest
        await Promise.all(manifest.chunks.map(e => fs.unlink(e).catch(d => {})));
        await fs.unlink(this.manifest_path).catch(e => {});

        return final_path;
    }

    getChunkPath(chunk_id: string) {
        return path.normalize(UPLOAD_PATH + '/' + this.file_id + '__' + chunk_id + '.chunk');
    }

    getManifest() : Promise<ChunkManifest> {
        return fs.readFile(this.manifest_path, 'utf-8').then(JSON.parse);
    }

    saveManifest(manifest: ChunkManifest) {
        return fs.writeFile(this.manifest_path, JSON.stringify(manifest)).then(() => manifest);
    }

    registerManifest(file_size: number, name: string, info: object) {
        return this.saveManifest({
            id: this.file_id,
            size: file_size,
            sent_size: 0,
            chunks: [],
            name,
            info,
        });
    }

    static registerManifest(file_size: number, name: string, info: object) {
        const cm = new ChunkManager(ChunkManager.getNewFileId());
        return cm.registerManifest(file_size, name, info);
    }

    protected get manifest_path() {
        return path.normalize(UPLOAD_PATH + '/' + this.file_id + '.manifest');
    }

    protected getChunkIndex(chunk_path: string) {
        const chunk_name = chunk_path.split(this.file_id + '__')[1];
        return Number(chunk_name.split('.chunk')[0]);
    }
}
