import { parentPort } from 'worker_threads';
import WorkerTaskMaker, { WorkerTask, TaskJobs } from './WorkerTask';

const DEBUG = false;
let task: WorkerTaskMaker;

parentPort!.on('message', (data: WorkerTask) => {
    if (data.type === "task") {
        console.log("New task on worker of type", data.task_type);

        const maker = TaskJobs[data.task_type];

        if (maker) {
            task = new WorkerTaskMaker(data.tweets, data.credentials, maker, parentPort!);
            task.debug_mode = DEBUG;

            task.start()
                .then(() => {
                    console.log("Worker task end");
                    parentPort!.postMessage({ type: "end" });
                })
                .catch(e => {
                    console.error("Worker task end with error", e);
                    parentPort!.postMessage({ type: "error", error: e });
                });
        }
        else {
          console.error("Worker task end with error", "Unexpected task type");
          parentPort!.postMessage({ type: "error", error: "Unexpected task type" });
        }
    }
    else if (data.type === "stop") {
        console.log("Request worker end");
        if (task) {
            task.stop();
        }
    }
});

