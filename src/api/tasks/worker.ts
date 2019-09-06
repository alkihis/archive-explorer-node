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
    tweets: string[] 
}

let authorized = true;

parentPort!.on('message', (data: WorkerTask) => {
    if (data.type === "task") {
        console.log("New task on worker");
        // Begin the task !
        startTask(data.credentials, data.tweets)
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

async function startTask(credentials: TwitterCredentials, ids: string[]) {
    const user = new Twitter({ 
        consumer_key: credentials.consumer_token,
        consumer_secret: credentials.consumer_secret,
        access_token_key: credentials.oauth_token,
        access_token_secret: credentials.oauth_token_secret
    });

    // do the task...
    let current_i = 0;
    // concurrent running tasks
    const CHUNK_LEN = 100;

    let promises: Promise<any>[] = [];

    let chunk = ids.slice(current_i, current_i + CHUNK_LEN);
    current_i += CHUNK_LEN;

    let current = { done: 0, failed: 0 };

    const done_pp_fn = (e: any) => { current.done++; };
    const failed_pp_fn = (e: any) => { current.failed++; };

    while (chunk.length) {
        if (!authorized)
            return;

        for (const id of chunk) {
            try {
                BigInt(id);
            } catch (e) {
                continue;
            }

            promises.push(
                user.post('statuses/destroy/' + id)
                    .then(done_pp_fn)
                    .catch(failed_pp_fn)
            );
        }

        if (!authorized)
            return;

        await Promise.all(promises);
        
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
