import express from 'express';
import commander from 'commander';
import { VERSION, CONFIG_FILE, TweetCounter } from './constants';
import logger from './logger';
import APIIndex, { apiErrors as APIErrors } from './api/index';
import socket_io from 'socket.io';
import http_base from 'http';
import https_base from 'https';
import { startIo } from './api/tasks/task_server';
import mongoose from 'mongoose';
import cors from 'cors';
import { COLLECTIONS } from './models';
import { readFileSync, mkdirSync } from 'fs';
import winston from 'winston';
import { purgeCollections, purgePartial, getCompleteUserFromTwitterScreenName, createTwitterObjectFromUser } from './helpers';
import Task, { isValidTaskType } from './api/tasks/Task';
import StaticServer from './static_server';
import CliHelper from './cli';

// archive-explorer-server main file
// Meant to serve archive-explorer website, 
// and provide an API in order to delete tweets

export let IS_DEV_MODE = true;

commander
    .version(VERSION)
    .option('-p, --port <port>', 'Server port', Number, 3128)
    .option('-m, --mongo-port <port>', 'Mongo server port', Number, 3281)
    .option('-p, --purge', 'Purge all mongo collection, then quit')
    .option('-d, --prod', 'Production mode (activate HTTPS, file logging)')
    .option('-l, --log-level [logLevel]', 'Log level [debug|silly|verbose|info|warn|error]', /^(debug|silly|verbose|info|warn|error)$/, 'info')
.parse(process.argv);

if (commander.logLevel) {
    logger.level = commander.logLevel;
}

const app = express();

let redirector: express.Express;
let http_server: http_base.Server | https_base.Server;

if (commander.prod) {
    IS_DEV_MODE = false;
    const SERVER_HTTPS_KEYS = CONFIG_FILE.https_key_directory;
    const credentials = {
        key: readFileSync(SERVER_HTTPS_KEYS + 'privkey.pem', 'utf8'),
        cert: readFileSync(SERVER_HTTPS_KEYS + 'cert.pem', 'utf8'),
        ca: readFileSync(SERVER_HTTPS_KEYS + 'chain.pem', 'utf8')
    };

    http_server = https_base.createServer(credentials, app); 
    redirector = express();
    commander.port = 443;

    // Activate file logger
    try {
        mkdirSync(__dirname + '/../logs');
    } catch (e) { }

    logger.add(new winston.transports.File({ filename: __dirname + '/../logs/info.log', level: 'info', eol: "\n" }));
    logger.add(new winston.transports.File({ filename: __dirname + '/../logs/warn.log', level: 'warn', eol: "\n" }));
    logger.add(new winston.transports.File({ filename: __dirname + '/../logs/error.log', level: 'error', eol: "\n" }));
    logger.exceptions.handle(new winston.transports.File({ 
        filename: __dirname + '/../logs/exceptions.log',
        eol: "\n"
    }));
    logger.exitOnError = false;
}
else {
    http_server = http_base.createServer(app);

    // Define cors request for dev
    app.use(cors({ credentials: true, origin: 'http://localhost:3000', allowedHeaders: "*", exposedHeaders: "*" }));
    app.options('*', cors({ credentials: true, origin: 'http://localhost:3000' }));
}

const io = socket_io(http_server);
export default io;

let db_ok = false;

logger.debug("Establishing MongoDB connection");

mongoose.connect('mongodb://localhost:' + commander.mongoPort + '/ae', { useNewUrlParser: true, useUnifiedTopology: true });

const db = mongoose.connection;

db.on('error', (msg: any) => {
    logger.error("Incoming error message from MongoDB:", msg);
});

db.once('open', function() {
    db_ok = true;

    if (commander.purge) {
        purgeCollections(COLLECTIONS, db, mongoose);
        return;
    }

    logger.verbose("MongoDB connection is open");

    // tmp redirect to .com
    app.use('*', (req, res, next) => {
        if (req.hostname && req.hostname.includes('archive-explorer.fr')) {
            res.redirect(301, 'https://archive-explorer.com');
        }
        else {
            next();
        }
    });

    logger.debug("Serving API");
    app.use('/api', APIIndex);
    app.use('/api', APIErrors);
    
    logger.debug("Serving static website");
    // File should be in build/
    app.use(StaticServer);
    
    // 404 not found for all others pages
    app.use((_, res) => {
        res.status(404).send();
    });
    
    // Use http, not app !
    http_server.listen(commander.port, () => {
        logger.info(`Archive Explorer Server ${VERSION} is listening on port ${commander.port}`);
        startCli();
    });

    if (commander.prod) {
        // set up a route to redirect http to https
        redirector.get('*', (req, res) => {  
            res.redirect('https://' + req.headers.host + req.url);
        });

        // have it listen on 80
        redirector.listen(80);
    }
    
    startIo();
});

function startCli() {
    function printTask(task: Task) {
        return `@${task.owner_screen_name} [${task.type} #${task.id}]: ${task.current_progression.remaining}/${task.current_progression.failed}/${task.current_progression.total} [${task.worker_count} threads]`;
    }

    const cli = new CliHelper("Command not recognized.");

    const collection = cli.addSubListener(
        'coll', 
        (_, __, validator) => validator ? "Available commands for coll: list, drop" : "Can't access collections: Database is not ready.", 
        () => db_ok
    );

    // Drop a collection
    collection.addSubListener(
        /^drop ?(.+)?/,
        (_, matches) => {
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
    collection.addSubListener(
        'list',
        `Available collections are: ${Object.keys(COLLECTIONS).join(', ')}`
    );

    // Exit the server
    cli.addSubListener('exit', () => {
        console.log("Goodbye.")
        TweetCounter.sync();
        process.exit(0);
    });

    // -----------------
    // | TASK LISTENER |
    // -----------------
    // Task listener: get info about running task, run a new task...
    const task_listener = cli.addSubListener(
        'task',
        () => `There are ${Task.count} running tasks. Available commands: list, create, stop`
    );

    // ------------
    // INFOS / LIST
    // Get info about all tasks
    const list_task_listener = task_listener.addSubListener(
        'list',
        () => `Running tasks (${Task.count}).\n${
            [...Task.all()]
                .map(printTask)
                .join('\n')
        }`
    );
    // List all tasks from user
    list_task_listener.addSubListener( 
        /^@(.+)/,
        async (_, matches) => {
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
    list_task_listener.addSubListener( 
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
    const task_stop_listener = task_listener.addSubListener(
        'stop',
        rest => {
            Task.get(rest.trim())?.cancel();
            return "Task stopped.";
        }
    );
    // Stop all tasks
    task_stop_listener.addSubListener( 
        'all',
        () => {
            for (const task of Task.all()) {
                task.cancel();
            }

            return `All tasks has been stopped.`;
        }
    );
    // Stop all tasks from user
    task_stop_listener.addSubListener( 
        /@(.+)/,
        async (_, matches) => {
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
    task_listener.addSubListener(
        /create @(\S+)/,
        async (rest, matches) => {
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
