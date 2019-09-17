import { Socket } from "socket.io";
import { Worker } from 'worker_threads';
import logger from "../../logger";
import { CONSUMER_KEY, CONSUMER_SECRET } from "../../twitter_const";

export interface TaskProgression {
    percentage: number;
    done: number;
    remaining: number;
    failed: number;
    total: number;
    id: string;
    error?: string;
    type: TaskType;
}

interface WorkerTask { 
    type: "task" | "stop", 
    credentials: TwitterCredentials, 
    tweets: string[],
    task_type: TaskType,
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

interface Credentials {
    user_id: string;
    oauth_token: string;
    oauth_token_secret: string;
}

export type TaskType = "tweet" | "mute" | "block" | "fav";

export function isValidTaskType(type: string) : type is TaskType {
    return type === "tweet" || type === "mute" || type === "block" || type === "fav";
}

export default class Task {
    protected static current_id = 1n;
    // Key is Task ID
    protected static readonly tasks_to_objects: Map<BigInt, Task> = new Map;
    // protected static readonly users_to_tasks: Map<string, Set<BigInt>> = new Map;

    // STATIC METHODS
    static get(id: string | BigInt) {
        if (typeof id === 'string') {
            id = BigInt(id);
        }

        return this.tasks_to_objects.get(id);
    }

    static tasksOf(user_id: string) {
        const tasks: Set<Task> = new Set;

        for (const [, t] of this.tasks_to_objects) {
            if (t.user.user_id === user_id) {
                tasks.add(t);
            }
        }

        return tasks;
    }

    static typeOf(type: TaskType, user_id: string) {
        const tasks = this.tasksOf(user_id);

        const t = new Set<Task>();

        for (const task of tasks) {
            if (task.type === type) {
                t.add(task);
            }
        }

        return t;
    }

    protected static register(task: Task) {
        this.tasks_to_objects.set(task.id, task);
    }

    protected static unregister(task: Task) {
        this.tasks_to_objects.delete(task.id);
    }

    // INSTANCE PROPERTIES & METHODS

    readonly id: BigInt;

    protected sockets: Set<Socket> = new Set;

    protected pool: Worker[] = [];

    protected done = 0;
    protected remaining = 0;
    protected failed = 0;

    protected last: TaskProgression;

    constructor(
        tweets_id: string[],
        protected user: Credentials,
        public readonly type: TaskType
    ) { 
        // Auto increment internal ID
        const c = Task.current_id;
        Task.current_id++;
        this.id = c;

        logger.verbose(`Starting task ${c} with ${tweets_id.length} tweets to delete`);

        this.last = {
            id: String(this.id),
            remaining: tweets_id.length,
            done: 0,
            failed: 0,
            percentage: 0,
            total: tweets_id.length,
            type: this.type
        };

        this.remaining = tweets_id.length;

        // Register task
        Task.register(this);

        // #USER_TASK Register to user to tasks (useless for now, see if it is too slow)
        // if (!users_to_tasks.has(this.user.user_id)) {
        //     users_to_tasks.set(this.user.user_id, new Set);
        // }
        // users_to_tasks.get(this.user.user_id)!.add(this.id);

        // Spawn worker thread(s)...
        // Pour le moment, il n'y en a qu'un seul de lancé
        const worker = new Worker(__dirname + '/worker.js');
        const task_to_worker: WorkerTask = {
            tweets: tweets_id,
            credentials: { 
                consumer_token: CONSUMER_KEY, 
                consumer_secret: CONSUMER_SECRET, 
                oauth_token: this.user.oauth_token, 
                oauth_token_secret: this.user.oauth_token_secret
            },
            type: "task",
            task_type: this.type
        };

        // Assignation des listeners
        worker.on('message', (data: WorkerMessage) => {
            logger.verbose("Recieved message from worker:", data);

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
                // Termine le worker
                this.end(false);
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
        socket.emit('progression', this.last);
    }

    unsubscribe(socket: Socket) {
        this.sockets.delete(socket);
    }

    clearSubs() {
        this.sockets.clear();
    }

    cancel() {
        logger.debug("Canceling task", this.id);
        this.sendMessageToSockets('task cancel', {
            id: String(this.id),
            type: this.type
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
                id: String(this.id),
                type: this.type
            });
        }

        logger.debug("Terminating workers");
        // Send stop message to workers then terminate
        for (const worker of this.pool) {
            worker.postMessage({ type: 'stop' });
            process.nextTick(() => worker.terminate());
        }

        // Empty pool of workers
        this.pool = [];

        this.clearSubs();

        // Unregister task from Maps
        Task.unregister(this);

        // #USER_TASK
        // const tasks = users_to_tasks.get(this.user.user_id);
        // if (tasks) {
        //     tasks.delete(this.id);

        //     if (!tasks.size) {
        //         users_to_tasks.delete(this.user.user_id);
        //     }
        // }

        logger.verbose(`Task ${this.id} has ended`);
    }

    get current_progression() {
        return this.last;
    }

    get owner() {
        return this.user.user_id;
    }

    protected emit(progression: TaskProgression) {
        this.last = progression;
        this.sendMessageToSockets('progression', progression);
    }

    protected sendMessageToSockets(name: string, message: any) {
        logger.debug(`Sending message ${name} to all sockets for task ${this.id}`, message);

        for (const s of this.sockets) {
            s.emit(name, message);
        }
    }

    protected emitProgress(done: number, remaining: number, failed: number) {
        const total = done + remaining + failed;

        this.emit({
            done, remaining, 
            id: String(this.id), 
            failed, 
            total, 
            percentage: ((done + failed) / total) * 100,
            type: this.type
        });
    }

    protected emitError(reason = "Unknown error") {
        this.emit({
            done: 0, 
            remaining: 0, 
            id: String(this.id), 
            total: 0, 
            failed: 0, 
            percentage: 0,
            error: reason,
            type: this.type
        });
    }
}