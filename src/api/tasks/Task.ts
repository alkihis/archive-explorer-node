import { Socket } from "socket.io";
import { Worker } from 'worker_threads';

export interface TaskProgression {
    percentage: number;
    done: number;
    remaining: number;
    failed: number;
    total: number;
    id: string;
    error?: string;
}

interface WorkerTask { 
    type: "task" | "stop", 
    credentials: TwitterCredentials, 
    tweets: string[] 
}

interface WorkerMessage {
    type: string;
    // SINCE THE LAST MESSAGE
    info?: {
        done: number;
        failed: number;
    };
    error?: any;
}

interface TwitterCredentials {
    consumer_token: string;
    consumer_secret: string;
    oauth_token: string;
    oauth_token_secret: string;
}

// Key is task ID
export const tasks_to_objects: Map<BigInt, Task> = new Map;

// Key is user id
export const users_to_tasks: Map<string, Set<BigInt>> = new Map;

export default class Task {
    readonly id: BigInt;

    protected sockets: Set<Socket> = new Set;
    protected static current_id = 1n;

    protected pool: Worker[] = [];

    protected done = 0;
    protected remaining = 0;
    protected failed = 0;

    protected last: TaskProgression;

    constructor(
        tweets_id: string[],
        protected user_id: string
    ) { 
        // Auto increment internal ID
        const c = Task.current_id;
        Task.current_id++;
        this.id = c;

        this.last = {
            id: String(this.id),
            remaining: tweets_id.length,
            done: 0,
            failed: 0,
            percentage: 0,
            total: tweets_id.length
        };

        this.remaining = tweets_id.length;

        // Register task
        tasks_to_objects.set(this.id, this);

        // Register to user to tasks
        if (!users_to_tasks.has(this.user_id)) {
            users_to_tasks.set(this.user_id, new Set);
        }

        users_to_tasks.get(this.user_id)!.add(this.id);

        // Spawn worker thread(s)...
        // Pour le moment, il n'y en a qu'un seul de lancé
        const worker = new Worker('worker.js');
        const task_to_worker: WorkerTask = {
            tweets: tweets_id,
            credentials: { consumer_secret: "", consumer_token: "", oauth_token: "", oauth_token_secret: "" },
            type: "task"
        };

        // Assignation des listeners
        worker.on('message', (data: WorkerMessage) => {
            if (data.type === "info") {
                // Envoi d'un message de progression de la suppression
                this.done += data.info!.done;
                this.remaining -= (data.info!.done + data.info!.failed);
                this.failed += data.info!.failed;

                this.emitProgress(this.done, this.remaining, this.failed);
            }
            else if (data.type === "end") {
                this.end();
            }
            else if (data.type === "error") {
                this.emitError(data.error);
            }
        });

        // Envoi de la tâche quand le worker est prêt
        worker.once('online', () => {
            worker.postMessage(task_to_worker);
        });

        this.pool.push(worker);
    }

    subscribe(socket: Socket) {
        this.sockets.add(socket);
    }

    unsubscribe(socket: Socket) {
        this.sockets.delete(socket);
    }

    clearSubs() {
        this.sockets.clear();
    }

    cancel() {
        this.sendMessageToSockets('task cancel', {
            id: String(this.id)
        });

        this.end(false);
    }

    end(with_end_message = true) {
        for (const worker of this.pool) {
            worker.removeAllListeners();
        }

        // Send end message to sockets
        if (with_end_message) {
            this.sendMessageToSockets('task end', {
                id: String(this.id)
            });
        }

        // Send stop message to workers then terminate
        for (const worker of this.pool) {
            worker.postMessage({ type: 'stop' });
            process.nextTick(() => worker.terminate());
        }

        // Empty pool of workers
        this.pool = [];

        this.clearSubs();

        // Unregister task from Maps
        tasks_to_objects.delete(this.id);

        const tasks = users_to_tasks.get(this.user_id);
        if (tasks) {
            tasks.delete(this.id);

            if (!tasks.size) {
                users_to_tasks.delete(this.user_id);
            }
        }
    }

    get current_progression() {
        return this.last;
    }

    get owner() {
        return this.user_id;
    }

    protected emit(progression: TaskProgression) {
        this.last = progression;
        this.sendMessageToSockets('progression', progression);
    }

    protected sendMessageToSockets(name: string, message: any) {
        for (const s of this.sockets) {
            s.emit(name, message);
        }
    }

    protected emitProgress(done: number, remaining: number, failed: number) {
        const total = done + remaining + failed;

        this.emit({
            done, remaining, id: String(this.id), failed, total, percentage: (done / total) * 100
        });
    }

    protected emitError(reason = "Unknown error") {
        this.emit({
            done: 0, remaining: 0, id: String(this.id), total: 0, failed: 0, percentage: 0, error: reason
        });
    }
}