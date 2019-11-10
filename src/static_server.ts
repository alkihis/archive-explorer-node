import express, { Router } from "express";
import path from 'path';
import Locales from './locales';
import { readFile } from "fs";
import logger from "./logger";

const router = Router();

const CACHE_FOR_LANGS: any = {};
function serveHtmlMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
    const lang = req.acceptsLanguages('fr', 'fr_FR', 'fr_CA', 'en');

    if (lang && !lang.includes("en") && lang in Locales) {
        const filename_changer = Locales[lang];

        if (filename_changer in CACHE_FOR_LANGS) {
            logger.debug("Serving page for lang " + lang + " from cache");
            res.send(CACHE_FOR_LANGS[filename_changer]);
            return;
        }

        const change = path.join(__dirname, "..", filename_changer);
        const original = path.join(__dirname, "../static/www/index.html");

        const original_string = new Promise((resolve, reject) => {
            readFile(original, (err, data) => {
                if (err) {
                    reject(err);
                    return;
                } 
                
                resolve(data.toString('utf-8'));
            });
        }) as Promise<string>;

        const replacement_string = new Promise((resolve, reject) => {
            readFile(change, (err, data) => {
                if (err) {
                    reject(err);
                    return;
                } 
                
                resolve(data.toString('utf-8'));
            });
        }) as Promise<string>;

        const replacement_regex = new RegExp(`<meta name="replacement">(.+)<meta name="end-replacement">`, 's')
        
        // Envoie un fichier remplacé
        Promise.all([original_string, replacement_string])
            .then(d => {
                logger.debug("Serving page for lang " + lang);
                let real_lang = lang;
                if (lang.includes('_')) {
                    real_lang = lang.split('_')[0];
                }

                res.send(
                    CACHE_FOR_LANGS[filename_changer] = d[0].replace(replacement_regex, d[1]).replace('lang="en"', `lang="${real_lang}"`)
                );
            })
            .catch(err => next(err));
    }
    else { 
        // Aucune modification nécessaire
        res.sendFile(path.join(__dirname, "../static/www/index.html"));
    }
}

const static_serve_middleware = express.static(path.join(__dirname, "../static/www"));

router.use('/', (req, res, next) => {
    if (req.path === "/" || req.path === "/index.html") {
        serveHtmlMiddleware(req, res, next);
    }
    else {
        static_serve_middleware(req, res, next);
    }
});

router.use('*', serveHtmlMiddleware);

export default router;
