import multer from 'multer';
import { mkdirSync, promises as fs } from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';

// 512 * 200: 100MB par archive max
export const MAX_ALLOWED_CHUNKS = 200;
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

        return fs.copyFile(file.path, newpath);
    }
}

export interface ChunkManifest {
    id: string;
    size: number;
    sent_size: number;
    chunks: string[];
    name: string;
    info: any;
    started_at: string;
    last_update: string;
}

export class ChunkManager {
    constructor(protected file_id: string) {}

    static getNewFileId() {
        return uuid();
    }

    static async removeOutdatedManifests() {
        const manifests = await fs.readdir(UPLOAD_PATH);
        const threshold = new Date();
        // Max life: 15 minutes
        threshold.setMinutes(threshold.getMinutes() - 15);
        const to_delete: [string, ChunkManifest][] = [];

        for (const manifest of manifests) {
            // Ignore non manifest files
            if (!manifest.endsWith('.manifest')) {
                continue;
            }

            const manifest_data: ChunkManifest = JSON.parse(await fs.readFile(UPLOAD_PATH + '/' + manifest, 'utf-8'));
            const last_updated = new Date(manifest_data.last_update);

            // If last update inferior to threshold time
            if (last_updated.getTime() < threshold.getTime()) {
                to_delete.push([manifest, manifest_data]);
            }
        }

        return Promise.all(to_delete.map(async ([item, manifest]) => {
            // Delete chunk attached to manifest
            await this.deleteFromManifest(manifest);
            // Delete manifest
            await fs.unlink(UPLOAD_PATH + '/' + item).catch(e => {});
        }));
    }

    protected static deleteFromManifest(manifest: ChunkManifest) {
        return Promise.all(
            manifest.chunks.map(e =>
                fs
                    .unlink(path.normalize(UPLOAD_PATH + '/' + e))
                    .catch(d => {})
            )
        );
    }

    async reconstructFile(manifest: ChunkManifest) {
        let i = 0;
        const indexed_chunks: [number, string][] = manifest.chunks.map(e => [this.getChunkIndex(e), e]);
        const sorted_chunks = indexed_chunks.sort((a, b) => {
            return a[0] - b[0];
        });
        const filename = this.file_id + '.zip';
        const final_path = path.normalize(UPLOAD_PATH + '/' + filename);

        for (const [chunk_index, chunk_name] of sorted_chunks) {
            if (chunk_index !== i) {
                throw new RangeError('Index order does not match');
            }

            const chunk_path = path.normalize(UPLOAD_PATH + '/' + chunk_name);
            // Append chunk to final file
            await fs.appendFile(final_path, await fs.readFile(chunk_path));

            i++;
        }

        // Ok, file reconstructed
        // Remove every chunk + manifest
        await ChunkManager.deleteFromManifest(manifest);
        await fs.unlink(this.manifest_path).catch(e => {});

        return filename;
    }

    getChunkPath(chunk_id: string) {
        return this.file_id + '__' + chunk_id + '.chunk';
    }

    getManifest() : Promise<ChunkManifest> {
        return fs.readFile(this.manifest_path, 'utf-8').then(JSON.parse);
    }

    saveManifest(manifest: ChunkManifest) {
        manifest.last_update = new Date().toISOString();
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
            started_at: new Date().toISOString(),
            last_update: '',
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

// Set timer to delete outdated manifests and chunks
setInterval(() => {
    ChunkManager.removeOutdatedManifests();
}, 120 * 1000);
