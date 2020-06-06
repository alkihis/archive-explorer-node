import CliHelper from 'interactive-cli-helper';
import mongoose from 'mongoose';
import Task, { isValidTaskType } from './api/tasks/Task';
import { COLLECTIONS } from './models';
import { purgePartial, getCompleteUserFromTwitterScreenName } from './helpers';
import { TweetCounter } from './constants';

export const CliSettings = {
    db_ok: false
};

export function startCli() {
    const db = mongoose.connection;

    function printTask(task: Task) {
        return `@${task.owner_screen_name} [${task.type} #${task.id}]: ${task.current_progression.remaining}/${task.current_progression.failed}/${task.current_progression.total} [${task.worker_count} threads]`;
    }

    const cli = new CliHelper({
        onNoMatch: "Command not recognized.",
        suggestions: true
    });

    const collection = cli.command(
        'coll',
        (_, __, validator) => validator ? "Available commands for coll: list, drop" : "Can't access collections: Database is not ready.",
        { onValidateBefore: () => CliSettings.db_ok }
    );

    // Drop a collection
    collection.command(
        /^drop ?(.+)?/,
        (_, __, matches) => {
            if (matches && matches[1]) {
                const coll = matches[1].split(/\s/g) as (keyof typeof COLLECTIONS)[];
                const to_delete = coll.filter(e => e in COLLECTIONS);

                if (to_delete.length) {
                    const colls: { [name: string]: any } = {};

                    for (const name of to_delete) {
                        colls[name] = COLLECTIONS[name];
                    }

                    return purgePartial(colls, db).then(() => "Purge completed.");
                }
                else {
                    return `Collection(s) ${coll.join(', ')} don't exist.`;
                }
            }
            else {
                return `Usage: coll drop <collectionName>`;
            }
        }
    );
    // List all the collections
    collection.command(
        'list',
        `Available collections are: ${Object.keys(COLLECTIONS).join(', ')}`
    );

    // Exit the server
    cli.command('exit', () => {
        console.log("Goodbye.")
        TweetCounter.sync();
        process.exit(0);
    });

    // -----------------
    // | TASK LISTENER |
    // -----------------
    // Task listener: get info about running task, run a new task...
    const task_listener = cli.command(
        'task',
        () => `There are ${Task.count} running tasks. Available commands: list, create, stop`
    );

    // ------------
    // INFOS / LIST
    // Get info about all tasks
    const list_task_listener = task_listener.command(
        'list',
        () => `Running tasks (${Task.count}).\n${
            [...Task.all()]
                .map(printTask)
                .join('\n')
            }`
    );
    // List all tasks from user
    list_task_listener.command(
        /^@(.+)/,
        async (_, __, matches) => {
            if (matches && matches[1]) {
                const user_sn = matches[1];
                const user_object = await getCompleteUserFromTwitterScreenName(user_sn);

                if (user_object) {
                    return [...Task.tasksOf(user_object.user_id)].map(printTask).join('\n');
                }
                return `User ${user_sn} does not exists.`;
            }
        }
    );
    // List a task by ID
    list_task_listener.command(
        /^\d+$/,
        rest => {
            const id = rest.trim();
            if (Task.exists(id)) {
                return printTask(Task.get(id)!);
            }
            return "This task does not exists.";
        }
    );

    // ----------
    // STOP TASKS
    const task_stop_listener = task_listener.command(
        'stop',
        rest => {
            Task.get(rest.trim())?.cancel();
            return "Task stopped.";
        }
    );
    // Stop all tasks
    task_stop_listener.command(
        'all',
        () => {
            for (const task of Task.all()) {
                task.cancel();
            }

            return `All tasks has been stopped.`;
        }
    );
    // Stop all tasks from user
    task_stop_listener.command(
        /@(.+)/,
        async (_, __, matches) => {
            if (matches && matches[1]) {
                const user_sn = matches[1];
                const user_object = await getCompleteUserFromTwitterScreenName(user_sn);

                if (user_object) {
                    for (const task of Task.tasksOf(user_object.user_id)) {
                        task.cancel();
                    }
                }
                return `Tasks of ${user_sn} has been stopped.`;
            }
        }
    );

    // ------------
    // CREATE TASKS
    task_listener.command(
        /create @(\S+)/,
        async (rest, _, matches) => {
            if (!matches || !matches[1]) {
                return "User not found.";
            }

            // User to create with
            const user_object = await getCompleteUserFromTwitterScreenName(matches[1]);
            if (!user_object) {
                return "User does not exists.";
            }

            const [type, ids] = rest.split(' ', 2);

            if (!type) {
                return "Task type is required.";
            }
            if (!ids) {
                return "IDs are required.";
            }

            if (!isValidTaskType(type)) {
                return "Invalid task type.";
            }

            const spaced = ids.split(' ').filter(e => e).map(e => e.split(',').filter(e => e));
            const all_ids = [...new Set(Array<string>().concat(...spaced))];

            // Create the task
            const task = new Task(all_ids, {
                oauth_token: user_object.oauth_token,
                oauth_token_secret: user_object.oauth_token_secret,
                user_id: user_object.user_id,
                screen_name: user_object.twitter_screen_name
            }, type);

            return `Task #${task.id} created for user @${user_object.twitter_screen_name}.`;
        }
    );

    cli.listen();
}
