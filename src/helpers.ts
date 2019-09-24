import { UserModel, TokenModel, IUser, TweetModel, ITweet, TwitterUserModel, ITwitterUser } from "./models";
import { SECRET_PRIVATE_KEY, SECRET_PASSPHRASE, SECRET_PUBLIC_KEY } from "./constants";
import jsonwebtoken from 'jsonwebtoken';
import twitterLite from "twitter-lite";
import { CONSUMER_KEY, CONSUMER_SECRET } from "./twitter_const";
import express from 'express';
import Mongoose from "mongoose";
import AEError, { sendError } from "./errors";
import { Status, FullUser } from "twitter-d";
import { TokenPayload, JSONWebToken } from "./interfaces";
import logger from "./logger";

export function methodNotAllowed(allow: string | string[]) {
    return (_: any, res: express.Response) => {
        res.setHeader('Allow', typeof allow === 'string' ? allow : allow.join(', '));
        sendError(AEError.invalid_method, res);
    };
}

export function sanitizeMongoObj<T extends Mongoose.Document>(data: T) : any {
    const original_clean = data.toJSON();

    for (const prop in original_clean) {
        if (prop.startsWith('_')) {
            delete original_clean[prop];
        }
    }

    return original_clean;
}

export function getUserFromToken(token: string) {
    return TokenModel.findOne({ token });
}

export function getTokensFromUser(user_id: string) {
    return TokenModel.find({ user_id });
}

export function getCompleteUserFromId(user_id: string) {
    return UserModel.findOne({ user_id });
}

export function getCompleteUserFromTwitterId(twitter_id: string) {
    return UserModel.findOne({ twitter_id });
}

export function batchTweets(ids: string[]) {
    logger.debug(`Batching ${ids.length} tweets from local MongoDB`);

    return TweetModel.find({ id_str: { $in: ids } })
        .then((statuses: ITweet[]) => {
            const obsoletes: ITweet[] = [];
            const current_date_minus = new Date;
            // Expiration: 3 mois
            current_date_minus.setMonth(current_date_minus.getMonth() - 3);

            // Check the tweets that are obsoletes
            statuses = statuses.filter(e => {
                // Check if moins de 3 mois
                if (e.inserted_time.getTime() < current_date_minus.getTime()) {
                    obsoletes.push(e);
                    return false;
                }
                return true;
            })

            // Delete obsoletes tweets
            TweetModel.deleteMany({ id: { $in: obsoletes.map(e => e.id_str) } });

            // Return valids
            return statuses;
        });
}

export function batchUsers(ids: string[]) {
    logger.debug(`Batching ${ids.length} users from local MongoDB`);

    return TwitterUserModel.find({ id_str: { $in: ids } })
        .then((users: ITwitterUser[]) => {
            const obsoletes: ITwitterUser[] = [];
            const current_date_minus = new Date;
            // Expiration: 15 jours
            current_date_minus.setDate(current_date_minus.getDate() - 15);

            // Check the tweets that are obsoletes
            users = users.filter(e => {
                // Check if moins de 3 mois
                if (e.inserted_time.getTime() < current_date_minus.getTime()) {
                    obsoletes.push(e);
                    return false;
                }
                return true;
            })

            // Delete obsoletes tweets
            TwitterUserModel.deleteMany({ id: { $in: obsoletes.map(e => e.id_str) } });

            // Return valids
            return users;
        });
}

export function saveTweets(tweets: Status[]) {
    return TweetModel.insertMany(
        tweets
            .map(e => suppressUselessTweetProperties(e))
            .map(t => { return {...t, inserted_time: new Date}; })
    );
}

export function saveTwitterUsers(users: FullUser[]) {
    return TwitterUserModel.insertMany(
        users
            .map(u => suppressUselessTUserProperties(u))
            .map(u => { return {...u, inserted_time: new Date}; })
    );
}

export function invalidateToken(token: string) {
    return TokenModel.deleteOne({ token });
}

export function invalidateTokensFromUser(user_id: string) {
    return TokenModel.deleteMany({ user_id });
}

export function isTokenInvalid(token: string, res?: express.Request) {
    return getUserFromToken(token)
        .then(model => {
            if (model) {
                // Actualise le last_use
                model.last_use = new Date;
                if (res) {
                    model.login_ip = res.connection.remoteAddress!;
                }
                // Sauvegarde sans considérer une erreur
                model.save().catch(e => e);

                return false;
            }
            return true;
        })
        .catch(() => true);
}

export async function checkToken(token: string) {
    const decoded: JSONWebToken = await new Promise((resolve, reject) => {
        jsonwebtoken.verify(token, SECRET_PUBLIC_KEY, (err, data) => {
            if (err) reject(err);
            resolve(data as any);
        })
    });
    
    if (await isTokenInvalid(decoded.jti)) {
        return undefined;
    }
    return decoded;
}

export function removeUser(user: IUser) {
    invalidateTokensFromUser(user.user_id);
    return user.remove();
}

export function signToken(payload: TokenPayload, id: string) {
    return new Promise((resolve, reject) => {
        // Signe le token
        jsonwebtoken.sign(
            payload, // Données custom
            { key: SECRET_PRIVATE_KEY, passphrase: SECRET_PASSPHRASE }, // Clé RSA privée
            { 
                algorithm: 'RS256', 
                expiresIn: "365d", // 1 an de durabilité
                issuer: "Archive Explorer Server 1", 
                jwtid: id, // ID généré avec uuid
            }, 
            (err, encoded) => { // Quand le token est généré (ou non), accepte/rejette la promesse
                if (err) reject(err);
                else resolve(encoded);
            }
        );
    }) as Promise<string>;
}

export function createTwitterObjectFromUser(user: IUser) {
    return new twitterLite({
        consumer_key: CONSUMER_KEY,
        consumer_secret: CONSUMER_SECRET,
        access_token_key: user.oauth_token,
        access_token_secret: user.oauth_token_secret
    });
}

export function suppressUselessTweetProperties(tweet: Status) {
    delete tweet.contributors;
    delete tweet.coordinates;
    delete tweet.current_user_retweet;
    delete tweet.favorited;
    delete tweet.place;
    delete tweet.retweeted;
    delete tweet.scopes;
    delete tweet.withheld_copyright;
    delete tweet.withheld_in_countries;
    delete tweet.withheld_scope;

    if (tweet.quoted_status) {
        tweet.quoted_status = suppressUselessTweetProperties(tweet.quoted_status);
    }
    if (tweet.retweeted_status) {
        tweet.retweeted_status = suppressUselessTweetProperties(tweet.retweeted_status);
    }

    tweet.user = suppressUselessTUserProperties(tweet.user as FullUser);

    return tweet;
}

export function suppressUselessTUserProperties(user: FullUser) {
    delete user.entities;
    delete user.listed_count;
    delete user.status;
    delete user.withheld_in_countries;
    delete user.withheld_scope;
    delete user.statuses_count;
    // @ts-ignore
    delete user.follow_request_sent;
    delete user.default_profile_image;
    delete user.default_profile;
    // @ts-ignore
    delete user.profile_background_image_url;
    // @ts-ignore
    delete user.profile_background_image_url_https;
    // @ts-ignore
    delete user.profile_background_tile;
    // @ts-ignore
    delete user.profile_background_color;
    // @ts-ignore
    delete user.geo_enabled;
    // @ts-ignore
    delete user.utc_offset;
    // @ts-ignore
    delete user.time_zone;
    // @ts-ignore
    delete user.contributors_enabled;
    // @ts-ignore
    delete user.is_translator;
    // @ts-ignore
    delete user.is_translation_enabled;
    // @ts-ignore
    delete user.profile_use_background_image;
    // @ts-ignore
    delete user.has_extended_profile;
    // @ts-ignore
    delete user.notifications;
    // @ts-ignore
    delete user.translator_type;

    return user;
} 

export function sendTwitterError(e: any, res: express.Response) {
    if (e.errors) {
        if (e.errors[0].code === 32 || e.errors[0].code === 89 || e.errors[0].code === 99) {
            sendError(AEError.twitter_credentials_expired, res);
        }
        else if (e.errors[0].code === 88) {
            sendError(AEError.twitter_rate_limit, res);
        }
        else {
            sendError(AEError.twitter_error, res, e);
        }
    }
    else {
        sendError(AEError.server_error, res);
    }
}

export async function deleteUser(user_id: string) {
    // Invalidate all tokens
    await invalidateTokensFromUser(user_id);
    // Delete user
    await UserModel.deleteOne({ user_id });
}

export async function changeSpecial(user_id: string, special = false) {
    const user = await getCompleteUserFromId(user_id);

    if (user) {
        user.special = special;
        user.save();
    }
}

export async function purgeCollections(COLLECTIONS: any, db: any, mongoose: any) {
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
}

export async function purgePartial(COLLECTIONS: any, db: any, mongoose: any) {
    const drops: Promise<any>[] = [];
    for (const collection of Object.keys(COLLECTIONS)) {
        drops.push(db.db.dropCollection(collection)
            .then(() => logger.info(`Collection ${collection} dropped.`))
            .catch(() => logger.warn(`Unable to drop collection ${collection}. (maybe it hasn't been created yet)`)));
    }

    Promise.all(drops).then(() => {
        logger.info("Purge is complete.");
    });
}
