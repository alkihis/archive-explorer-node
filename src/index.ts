import express from 'express';
import commander from 'commander';
import { VERSION } from './constants';
import logger from './logger';
import api_index, { apiErrors } from './api/index';
import path from 'path';
import socket_io from 'socket.io';
import http_base from 'http';
// import https_base from 'https';
import { startIo } from './api/tasks/task_server';
import mongoose from 'mongoose';
import cors from 'cors';
import { COLLECTIONS } from './models';

// archive-explorer-server main file
// Meant to serve archive-explorer website, 
// and provide an API in order to delete tweets

commander
    .version(VERSION)
    .option('-p, --port <port>', 'Server port', Number, 3128)
    .option('-m, --mongo-port <port>', 'Mongo server port', Number, 3281)
    .option('-p, --purge', 'Purge all mongo collection, then quit')
    .option('-l, --log-level [logLevel]', 'Log level [debug|verbose|info|warn|error]', /^(debug|verbose|info|warn|error)$/, 'info')
.parse(process.argv);

if (commander.logLevel) {
    logger.level = commander.logLevel;
}

const app = express();

const http = http_base.createServer(app);

app.use(cors({ credentials: true, origin: 'http://localhost:3000' }));
app.options('*', cors({ credentials: true, origin: 'http://localhost:3000' }));

/* DEPLOY
const SERVER_HTTPS_KEYS = "/etc/letsencrypt/live/beta.archive-explorer.fr/";
const credentials = {
    key: readFileSync(SERVER_HTTPS_KEYS + 'privkey.pem', 'utf8'),
    cert: readFileSync(SERVER_HTTPS_KEYS + 'cert.pem', 'utf8'),
    ca: readFileSync(SERVER_HTTPS_KEYS + 'chain.pem', 'utf8')
};

const http = express();
const https = https_base.createServer(credentials, app); 
*/

// DEV
const io = socket_io(http);

// DEPLOY
// const io = socket_io(https);
export default io;

logger.debug("Establishing MongoDB connection");

mongoose.connect('mongodb://localhost:' + commander.mongoPort + '/ae', { useNewUrlParser: true, useUnifiedTopology: true });

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
    if (commander.purge) {
        const drops: Promise<any>[] = [];
        for (const collection of Object.keys(COLLECTIONS)) {
            drops.push(db.db.dropCollection(collection)
                .then(() => logger.info(`Collection ${collection} dropped.`))
                .catch(() => logger.warn(`Unable to drop collection ${collection}. (maybe it hasn't been created yet)`)));
        }

        Promise.all(drops).then(() => db.close()).then(() => {
            mongoose.disconnect();
            logger.info("Mongo disconnected. Purge is complete.");
        });

        return;
    }

    logger.verbose("MongoDB connection is open");

    logger.debug("Serving API");
    app.use('/api', api_index);
    app.use('/api', apiErrors);
    
    logger.debug("Serving static website");
    // File should be in build/
    app.use('/', express.static(path.join(__dirname, "../static/www")));
    app.use('*', (_, response) => {
        response.sendFile(path.join(__dirname, "../static/www/index.html"));
    });

    // 404 not found for all others pages
    app.use((_, res) => {
        res.status(404).send();
    });
    
    // Use http, not app !
    http.listen(commander.port, () => {
        logger.info(`Archive Explorer Server ${VERSION} is listening on port ${commander.port}`);
    });
    
    /* DEPLOY
    // set up a route to redirect http to https
    http.get('*', (req, res) => {  
        res.redirect('https://' + req.headers.host + req.url);
    });

    // have it listen on 8080
    http.listen(80);

    // Use https, not app !
    https.listen(443, () => {
        logger.info(`Archive Explorer Server ${VERSION} is listening on port 443`);
    });
    */
    
    startIo();
});
