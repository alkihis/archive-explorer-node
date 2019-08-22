import express from 'express';
import commander from 'commander';
import { VERSION } from './constants';
import logger from './logger';
import api_index, { apiErrors } from './api/index';
import path from 'path';
import socket_io from 'socket.io';
import http_base from 'http';
import { startIo } from './api/tasks/task_server';
import mongoose from 'mongoose';
import { signToken } from './helpers';
import { TokenModel } from './models';

// archive-explorer-server main file
// Meant to serve archive-explorer website, 
// and provide an API in order to delete tweets

commander
    .version(VERSION)
    .option('-p, --port <port>', 'Server port', Number, 3128)
    .option('-l, --log-level [logLevel]', 'Log level [debug|verbose|info|warn|error]', /^(debug|verbose|info|warn|error)$/, 'info')
.parse(process.argv);

if (commander.logLevel) {
    logger.level = commander.logLevel;
}

const app = express();

const http = http_base.createServer(app);
const io = socket_io(http);
export default io;

mongoose.connect('mongodb://localhost:3281/ae', { useNewUrlParser: true });

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
    app.use('/api', api_index);
    app.use('/api', apiErrors);
    
    // File should be in build/
    app.use('/', express.static(path.join(__dirname, "../static/www")));
    
    // 404 not found for all others pages
    app.use((_, res) => {
        res.status(404).send();
    });
    
    app.listen(commander.port, () => {
        console.log(`Archive Explorer Server ${VERSION} is listening on port ${commander.port}`);
    });
    
    startIo();
});
