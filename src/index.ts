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
import { purgeCollections, purgePartial } from './helpers';
import Task from './api/tasks/Task';
import StaticServer from './static_server';

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
    .option('-l, --log-level [logLevel]', 'Log level [debug|verbose|info|warn|error]', /^(debug|verbose|info|warn|error)$/, 'info')
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
    app.use(cors({ credentials: true, origin: 'http://localhost:3000' }));
    app.options('*', cors({ credentials: true, origin: 'http://localhost:3000' }));
}

const io = socket_io(http_server);
export default io;

let db_ok = false;
startCli();

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
    process.stdin.on('data', (data: Buffer) => {
        let line = data.toString().trim();

        if (line.startsWith('coll')) {
            if (!db_ok) {
                logger.warn("Can't access collections: Database is not ready.");
                return;
            }

            line = line.slice(4).trim();

            const match_drop = line.match(/drop (.+)/);

            if (match_drop) {
                const coll = match_drop[1].split(/\s/g) as (keyof typeof COLLECTIONS)[];
                const to_delete = coll.filter(e => e in COLLECTIONS);

                if (to_delete.length) {
                    logger.info(`Collection ${coll} is about to be dropped.`);

                    const colls: { [name: string]: any } = {};
                    
                    for (const name of to_delete) {
                        colls[name] = COLLECTIONS[name];
                    }

                    purgePartial(colls, db, mongoose);
                }
                else {
                    logger.warn(`Collection(s) ${coll.join(', ')} don't exist.`);
                }
            }
            else if (line === "drop") {
                logger.info(`Usage: coll drop <collectionName>`);
            }
            else if (line === "list") {
                logger.info(`Available collections are: ${Object.keys(COLLECTIONS).join(', ')}`);
            }
            else {
                logger.info("Available commands for coll: list, drop");
            }
        }
        else if (line === "exit") {
            logger.verbose('Goodbye.');
            TweetCounter.sync();
            process.exit(0);
        }
        else if (line === "task") {
            logger.info("There are " + Task.count + " running tasks");
        }
        else {
            logger.warn(`Command not recognized.`);
        }
    });
}
