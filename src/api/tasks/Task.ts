import { Socket } from "socket.io";
import { Worker } from 'worker_threads';
import logger from "../../logger";
import { CONSUMER_KEY, CONSUMER_SECRET } from "../../twitter_const";
import { TweetCounter } from "../../constants";
import Timer from 'timerize';

Timer.default_format = "s";

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
    debug?: boolean,
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
    screen_name?: string;
}

export type TaskType = "tweet" | "mute" | "block" | "fav" | "dm";

export function isValidTaskType(type: string) : type is TaskType {
    return type === "tweet" || type === "mute" || type === "block" || type === "fav" || type === "dm";
}

function getFormattedDate() {
    const now = new Date;
    const [month, day] = [
        String(now.getMonth() + 1).padStart(2, "0"),
        String(now.getDate()).padStart(2, "0")
    ];
    const final_date = `${now.getFullYear()}-${month}-${day} ${now.getHours()}:${now.getMinutes()}:${now.getSeconds()}`;

    return final_date;
}

export default class Task {
    // @ts-ignore
    protected static current_id = 1n;
    // Key is Task ID
    protected static readonly tasks_to_objects: Map<BigInt, Task> = new Map;
    protected static readonly users_to_tasks: Map<string, Set<Task>> = new Map;
    
    static readonly DEFAULT_THREAD_NUMBER = 2;

    // STATIC METHODS
    static get(id: string | BigInt) {
        if (typeof id === 'string') {
            id = BigInt(id);
        }

        return this.tasks_to_objects.get(id);
    }

    static exists(id: string | BigInt) {
        return this.get(id) !== undefined;
    }

    static tasksOf(user_id: string) {
        if (this.users_to_tasks.has(user_id)) {
            return this.users_to_tasks.get(user_id)!;
        }

        return new Set<Task>();
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

    static get count() {
        return this.tasks_to_objects.size;
    }

    static *all() {
        for (const [, tasks] of this.users_to_tasks) {
            yield* tasks;
        }
    }

    protected static register(task: Task) {
        this.tasks_to_objects.set(task.id, task);

        // USER TASK
        if (!this.users_to_tasks.has(task.owner)) {
            this.users_to_tasks.set(task.owner, new Set);
        }
        this.users_to_tasks.get(task.owner)!.add(task);
    }

    protected static unregister(task: Task) {
        this.tasks_to_objects.delete(task.id);

        // USER TASK
        const tasks = this.users_to_tasks.get(task.owner);
        if (tasks) {
            tasks.delete(task);

            if (!tasks.size) {
                this.users_to_tasks.delete(task.owner);
            }
        }
    }

    // INSTANCE PROPERTIES & METHODS
    
    readonly id: BigInt;

    protected sockets: Set<Socket> = new Set;

    protected pool: Worker[] = [];

    protected done = 0;
    protected remaining = 0;
    protected failed = 0;

    protected timer?: Timer = new Timer;

    protected last: TaskProgression;

    /**
     * Log Twitter errors encountered during execution (code (as string) => [number of occurences, message for code])
     */
    protected twitter_errors_encountered: { [code: string]: [number, string] } = {};

    constructor(
        items_ids: string[],
        protected user: Credentials,
        public readonly type: TaskType,
        thread_number: number = Task.DEFAULT_THREAD_NUMBER,
    ) { 
        // Auto increment internal ID
        const c = Task.current_id;
        Task.current_id++;
        this.id = c;
        
        logger.info(`${getFormattedDate()}> Creation of task #${this.id}, type ${type} for user @${user.screen_name} (${items_ids.length} elements)`);

        this.last = {
            id: String(this.id),
            remaining: items_ids.length,
            done: 0,
            failed: 0,
            percentage: 0,
            total: items_ids.length,
            type: this.type
        };

        this.remaining = items_ids.length;

        // Register task
        Task.register(this);

        // Spawn worker thread(s)...
        // Découpage en {thread_number} parties le tableau de tweets
        if (items_ids.length <= thread_number ||items_ids.length < 50) {
            // Si il y a moins d'items que de threads, alors on lance un seul thread (y'en a pas beaucoup)
            // Ou alors si il y a peu d'items
            this.startWorker(items_ids);
        }
        else {
            const chunk_length = Math.ceil(items_ids.length / thread_number);
            let i = 0;
            let items_ids_part: string[];
    
            while ((items_ids_part = items_ids.slice(i, i + chunk_length)).length) {
                this.startWorker(items_ids_part);
                i += chunk_length;
            }
        }
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

        let computed_stats = `${this.done} ok${this.failed ? `, ${this.failed} failed` : ""} over ${this.length}`;
        if (this.remaining) {
            computed_stats += ` (Remaining ${this.remaining})`;
        }

        logger.info(`${getFormattedDate()}> Task #${this.id} of type ${this.type} from @${this.user.screen_name} has ended. Taken ${this.timer?.elapsed}s. ${computed_stats}`);
        this.timer = undefined;

        if (this.has_twitter_errors_encountered) {
            logger.warn(`Task #${this.id}: Twitter errors has been encountered: ${
                Object.entries(this.twitter_errors_encountered)
                    .map(([code, count]) => `code ${code} '${count[1]}' [${count[0]} times]`)
                    .join(', ')
            }`);
        }
    }

    get current_progression() {
        return this.last;
    }

    get owner() {
        return this.user.user_id;
    }

    get owner_screen_name() {
        return this.user.screen_name!;
    }

    get worker_count() {
        return this.pool.length;
    }

    get length() {
        return this.done + this.remaining + this.failed;
    }

    get has_twitter_errors_encountered() {
        return Object.keys(this.twitter_errors_encountered).length > 0;
    }

    protected startWorker(items: string[]) {
        logger.silly(`Task #${this.id}: Starting worker ${this.pool.length + 1} with ${items.length} items.`);

        const worker = new Worker(__dirname + '/task_worker/worker.js');
        const task_to_worker: WorkerTask = {
            tweets: items,
            credentials: { 
                consumer_token: CONSUMER_KEY, 
                consumer_secret: CONSUMER_SECRET, 
                oauth_token: this.user.oauth_token, 
                oauth_token_secret: this.user.oauth_token_secret
            },
            type: "task",
            task_type: this.type,
            debug: this.debug_mode,
        };

        // Assignation des listeners
        worker.on('message', this.onWorkerMessage(worker));

        // Envoi de la tâche quand le worker est prêt
        worker.once('online', () => {
            worker.postMessage(task_to_worker);
        });

        this.pool.push(worker);
    }

    protected onWorkerMessage(worker: Worker) {
        return (data: WorkerMessage) => {
            logger.silly("Recieved message from worker:", data);

            if (data.type === "info") {
                // Envoi d'un message de progression de la suppression
                this.done += data.info!.done;
    
                // Incrémente le compteur si la tâche est de type tweet
                if (this.type === "tweet")
                    TweetCounter.inc(data.info!.done);
                
                this.remaining -= (data.info!.done + data.info!.failed);
                this.failed += data.info!.failed;
    
                this.emitProgress(this.done, this.remaining, this.failed);
            }
            else if (data.type === "end") {
                // End if all workers end
                this.pool = this.pool.filter(w => w !== worker);
                logger.verbose(`Terminating a worker on task #${this.id}.`);
                process.nextTick(() => worker.terminate());

                if (this.pool.length === 0) {
                    // All is over !
                    this.end();
                }
            }
            else if (data.type === "error") {
                this.emitError(data.error);
                // Termine le worker
                this.end(false);
            }
            else if (data.type === "misc") {
                logger.debug("Worker misc data", data);
            }
            else if (data.type === "twitter_error") {
                const errors = data.error as {[code: string]: [number, string]};
    
                for (const error in errors) {
                    if (error in this.twitter_errors_encountered) {
                        this.twitter_errors_encountered[error][0] += errors[error][0];
                    }
                    else {
                        this.twitter_errors_encountered[error] = errors[error];
                    }
                }
            }
        };
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
            done, 
            remaining, 
            id: String(this.id), 
            failed, 
            total, 
            percentage: ((done + failed) / total) * 100,
            type: this.type
        });
    }

    protected emitError(reason = "Unknown error") {
        logger.warn(`Error in worker for task #${this.id}: ${reason}`);
        this.emit({
            done: 0, 
            remaining: 0, 
            id: String(this.id), 
            total: this.length, 
            failed: 0, 
            percentage: 0,
            error: reason,
            type: this.type
        });
    }

    protected get debug_mode() {
        return logger.level === "debug";
    }
}