import Twitter from 'twitter-lite';
import { MessagePort } from 'worker_threads';

/**
 * Represents a current Twitter user, used to make requests.
 */
export interface TwitterCredentials {
    consumer_token: string;
    consumer_secret: string;
    oauth_token: string;
    oauth_token_secret: string;
}

/**
 * Message sended to worker to start a new task.
 */
export interface WorkerTask {
    type: "task" | "stop",
    credentials: TwitterCredentials,
    tweets: string[],
    task_type: TaskType,
    debug?: boolean;
}

/**
 * Object used to start a new task with the WorkerTaskMaker
 */
export interface TaskStarter {
    method: string;
    request: (id: string) => ({ endpoint: string, parameters: object });
    chunk_length: number;
    retry_on_rate_limit_exceeded?: boolean;
}

/**
 * Link a TaskType to its TaskStarter object.
 */
export const TaskJobs = {
    tweet: {
        method: 'POST',
        request: (id: string) => ({ endpoint: 'statuses/destroy/' + id, parameters: { trim_user: true } }),
        chunk_length: 100,
        retry_on_rate_limit_exceeded: true
    },
    mute: {
        method: 'POST',
        request: (id: string) => ({ endpoint: 'mutes/users/destroy', parameters: { user_id: id } }),
        chunk_length: 75,
        retry_on_rate_limit_exceeded: true
    },
    block: {
        method: 'POST',
        request: (id: string) => ({ endpoint: 'blocks/destroy', parameters: { user_id: id, include_entities: false, skip_status: true } }),
        chunk_length: 75,
        retry_on_rate_limit_exceeded: true
    },
    fav: {
        method: 'POST',
        request: (id: string) => ({ endpoint: 'favorites/destroy', parameters: { id, include_entities: false } }),
        chunk_length: 75,
        retry_on_rate_limit_exceeded: true
    },
    dm: {
        method: 'DELETE',
        request: (id: string) => ({ endpoint: 'direct_messages/events/destroy', parameters: { id } }),
        chunk_length: 100,
        retry_on_rate_limit_exceeded: true
    }
};

export type TaskType = keyof typeof TaskJobs;


/**
 * Represents a current task handled by the current worker.
 */
export default class WorkerTaskMaker {
    protected task_maker: (id: string) => Promise<any>;

    public debug_mode = false;
    protected stopped = false;

    constructor(
        protected ids: string[],
        credentials: TwitterCredentials,
        protected starter: TaskStarter,
        protected message_port: MessagePort,
    ) {
        const user = new Twitter({
            consumer_key: credentials.consumer_token,
            consumer_secret: credentials.consumer_secret,
            access_token_key: credentials.oauth_token,
            access_token_secret: credentials.oauth_token_secret
        });

        let fn: (endpoint: string, parameters: object) => Promise<any>;
        switch (starter.method) {
            case "POST":
                fn = user.post.bind(user);
                break;
            case "DELETE":
                fn = user.delete.bind(user);
                break;
            default:
                fn = user.get.bind(user);
        }

        this.task_maker = id => {
            const { endpoint, parameters } = starter.request(id);
            return fn(endpoint, parameters);
        };
    }

    async start() {
        // concurrent running tasks
        let chunk_len = this.starter.chunk_length;
        let do_task = this.task_maker;

        // DEBUG
        if (this.debug_mode) {
            chunk_len = 3;
            do_task = () => new Promise(resolve => setTimeout(resolve, 500));

            this.message_port!.postMessage({
                type: "misc", ids: this.ids
            });
        }

        // do the task...
        let current_i = 0;

        let promises: Promise<any>[] = [];

        let chunk = this.ids.slice(current_i, current_i + chunk_len);
        current_i += chunk_len;

        let current = { done: 0, failed: 0 };
        let last_errors: {[code: string]: [number, string]} = {};

        const done_pp_fn = () => { current.done++; };
        const failed_pp_fn: (e: any) => Promise<any> | undefined = (e: any) => {
            // Check errors
            if (this.starter.retry_on_rate_limit_exceeded && e && e.errors && e.errors[0].code === 88) {
                // Rate limit exceeded
                return Promise.reject(88);
            }
            else if (e && e.errors) {
                if (e.errors[0].code in last_errors) {
                    last_errors[e.errors[0].code][0]++;
                }
                else {
                    last_errors[e.errors[0].code] = [1, e.errors[0].message];
                }
            }

            current.failed++;
        };

        while (chunk.length) {
            if (this.stopped)
                return;

            for (const id of chunk) {
                try {
                    BigInt(id);
                } catch (e) {
                    current.failed++;
                    continue;
                }

                promises.push(
                    do_task(id)
                        .then(done_pp_fn)
                        .catch(failed_pp_fn)
                );
            }

            if (this.stopped)
                return;

            try {
                await Promise.all(promises);
            } catch (e) {
                // Un tweet est en rate limit exceeded
                if (e === 88 && this.starter.retry_on_rate_limit_exceeded) {
                    console.log(`Rate limit exceeded for worker`);

                    // Reset des var de boucle
                    promises = [];

                    // Attends 5 minutes avant de recommencer
                    await sleep(1000 * 60 * 5);

                    current.done = 0;
                    current.failed = 0;
                    last_errors = {};

                    continue;
                }
            }

            // Emet le message d'avancement
            this.message_port.postMessage({
                type: 'info',
                info: { done: current.done, failed: current.failed }
            });

            promises = [];
            current.done = 0;
            current.failed = 0;

            // Signale les erreurs rencontrées
            if (Object.keys(last_errors).length) {
                this.message_port.postMessage({
                    type: "twitter_error", error: last_errors
                });
            }
            last_errors = {};

            chunk = this.ids.slice(current_i, current_i + chunk_len);
            current_i += chunk_len;
        }
    }

    stop() {
        this.stopped = true;
    }
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

