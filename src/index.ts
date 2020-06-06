import express from 'express';
import commander from 'commander';
import { mkdirSync } from 'fs';
import winston from 'winston';
import { VERSION } from './constants';
import logger, { FORMAT_FILE } from './logger';
import APIIndex, { apiErrors as APIErrors } from './api/index';
import socket_io from 'socket.io';
import http_base from 'http';
import { startIo } from './api/tasks/task_server';
import mongoose from 'mongoose';
import cors from 'cors';
import { COLLECTIONS } from './models';
import { purgeCollections } from './helpers';
import StaticServer from './static_server';
import { CliSettings, startCli } from './cli';

// archive-explorer-server main file
// Meant to serve archive-explorer website, 
// and provide an API in order to delete tweets

export let IS_DEV_MODE = true;

commander
    .version(VERSION)
    .option('-p, --port <port>', 'Server port', Number, 3128)
    .option('-m, --mongo-port <port>', 'Mongo server port', Number, 3281)
    .option('-p, --purge', 'Purge all mongo collection, then quit')
    .option('--prod')
    .option('--file-logging')
    .option('-l, --log-level [logLevel]', 'Log level [debug|silly|verbose|info|warn|error]', /^(debug|silly|verbose|info|warn|error)$/, 'info')
.parse(process.argv);

if (process.env.NODE_ENV === 'production' || commander.prod) {
    IS_DEV_MODE = false;
}

if (commander.logLevel) {
    logger.level = commander.logLevel;
}

const app = express();
http_base.globalAgent.maxSockets = Infinity;

let http_server: http_base.Server;
let file_logging = commander.fileLogging;
http_server = http_base.createServer(app);

if (!IS_DEV_MODE) {
    console.log("Starting with prod mode.");
    logger.exitOnError = false;
}
else {
    console.log("Starting with dev mode.");
    
    if (file_logging === undefined) {
        file_logging = true;
    }

    // Define cors request for dev
    app.use(cors({ credentials: true, origin: '*', allowedHeaders: "*", exposedHeaders: "*" }));
    app.options('*', cors({ credentials: true, origin: '*' }));
}

if (file_logging) {
    // Activate file logger
    try {
        mkdirSync(__dirname + '/../logs');
    } catch (e) { }

    logger.add(new winston.transports.File({ 
        filename: __dirname + '/../logs/info.log', 
        level: 'info', 
        eol: "\n", 
        format: FORMAT_FILE 
    }));
    logger.add(new winston.transports.File({ 
        filename: __dirname + '/../logs/warn.log', 
        level: 'warn', 
        eol: "\n", 
        format: FORMAT_FILE 
    }));
    logger.add(new winston.transports.File({ 
        filename: __dirname + '/../logs/error.log', 
        level: 'error', 
        eol: "\n", 
        format: FORMAT_FILE 
    }));
    logger.exceptions.handle(new winston.transports.File({ 
        filename: __dirname + '/../logs/exceptions.log',
        eol: "\n",
        format: FORMAT_FILE
    }));
}

const io = socket_io(http_server);
export default io;

logger.debug("Establishing MongoDB connection");

mongoose.connect('mongodb://localhost:' + commander.mongoPort + '/ae', { useNewUrlParser: true, useUnifiedTopology: true });

const db = mongoose.connection;

db.on('error', (msg: any) => {
    logger.error("Incoming error message from MongoDB:", msg);
});

db.once('open', function() {
    CliSettings.db_ok = true;

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
    
    startIo();
});

