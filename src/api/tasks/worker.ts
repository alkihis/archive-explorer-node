import { parentPort } from 'worker_threads';
import Twitter from 'twitter-lite';

interface TwitterCredentials {
    consumer_token: string;
    consumer_secret: string;
    oauth_token: string;
    oauth_token_secret: string;
}

interface WorkerTask { 
    type: "task" | "stop", 
    credentials: TwitterCredentials, 
    tweets: string[],
    task_type: TaskType
}

type TaskType = "tweet" | "mute" | "block" | "fav";

let authorized = true;

parentPort!.on('message', (data: WorkerTask) => {
    if (data.type === "task") {
        console.log("New task on worker of type", data.task_type);
        // Begin the task !
        startTask(data.credentials, data.tweets, data.task_type)
            .then(() => {
                console.log("Worker task end");
                parentPort!.postMessage({ type: "end" });
            })
            .catch(e => {
                console.error("Worker task end with error", e);
                parentPort!.postMessage({ type: "error", error: e });
            });
    }
    else if (data.type === "stop") {
        console.log("Request worker end");
        authorized = false;
    }
});

function startTask(credentials: TwitterCredentials, ids: string[], type: TaskType) {
    const user = new Twitter({ 
        consumer_key: credentials.consumer_token,
        consumer_secret: credentials.consumer_secret,
        access_token_key: credentials.oauth_token,
        access_token_secret: credentials.oauth_token_secret
    });

    switch (type) {
        case "tweet":
            return startTweetTask(user, ids);
        case "fav":
            return startFavsTask(user, ids);
        case "block":
            return startBlockTask(user, ids);
        case "mute":
            return startMuteTask(user, ids);
        default:
            return Promise.reject("Unexpected task type");
    }
}

function startTweetTask(user: Twitter, ids: string[]) {
    return task(
        ids,
        id => user.post('favorites/destroy', { id, include_entities: false }),
        100,
        true
    );
}

function startFavsTask(user: Twitter, ids: string[]) {
    return task(
        ids,
        id => user.post('favorites/destroy', { id, include_entities: false }),
        50,
        true
    );
}

function startBlockTask(user: Twitter, ids: string[]) {
    return task(
        ids,
        id => user.post('blocks/destroy', { user_id: id, include_entities: false, skip_status: true }),
        75,
        true
    );
}

function startMuteTask(user: Twitter, ids: string[]) {
    return task(
        ids,
        id => user.post('mutes/users/destroy', { user_id: id }),
        75,
        true
    );
}

async function task(
    ids: string[], 
    do_task: (id: string) => Promise<any>, 
    chunk_len: number, 
    retry_on_88 = true
) {
    // do the task...
    let current_i = 0;
    // concurrent running tasks
    const CHUNK_LEN = chunk_len;

    let promises: Promise<any>[] = [];

    let chunk = ids.slice(current_i, current_i + CHUNK_LEN);
    current_i += CHUNK_LEN;

    let current = { done: 0, failed: 0 };

    const done_pp_fn = () => { current.done++; };
    const failed_pp_fn: (e: any) => Promise<any> | undefined = (e: any) => { 
        // Check errors
        if (retry_on_88 && e && e.errors && e.errors[0].code === 88) {
            // Rate limit exceeded
            return Promise.reject(88);
        }

        current.failed++; 
    };

    while (chunk.length) {
        if (!authorized)
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

        if (!authorized)
            return;

        try {
            await Promise.all(promises);
        } catch (e) {
            // Un tweet est en rate limit exceeded
            if (e === 88 && retry_on_88) {
                console.log(`Rate limit exceeded for worker`);
                
                // Reset des var de boucle
                promises = [];

                // Attends 5 minutes avant de recommencer
                await sleep(1000 * 60 * 5);

                current.done = 0;
                current.failed = 0;
                
                continue;
            }
        }
        
        // Emet le message d'avancement
        parentPort!.postMessage({ 
            type: 'info', 
            info: { done: current.done, failed: current.failed } 
        });

        promises = [];
        current.done = 0;
        current.failed = 0;

        chunk = ids.slice(current_i, current_i + CHUNK_LEN);
        current_i += CHUNK_LEN;
    }
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
