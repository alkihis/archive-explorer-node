import { UserModel, TokenModel, IUser, TweetModel, ITweet, TwitterUserModel, ITwitterUser, IToken, CloudedArchiveModel, ICloudedArchive } from "./models";
import { SECRET_PRIVATE_KEY, SECRET_PASSPHRASE, SECRET_PUBLIC_KEY } from "./constants";
import JsonWebToken from 'jsonwebtoken';
import TwitterLite from "./twitter_lite_clone/twitter_lite";
import { CONSUMER_KEY, CONSUMER_SECRET } from "./twitter_const";
import express from 'express';
import Mongoose from "mongoose";
import AEError, { sendError } from "./errors";
import { Status, FullUser } from "twitter-d";
import { TokenPayload, JSONWebToken } from "./interfaces";
import logger from "./logger";
import * as fs from "fs";
import { UPLOAD_PATH } from "./uploader";

export function methodNotAllowed(allow: string | string[]) {
    return (_: any, res: express.Response) => {
        res.setHeader('Allow', typeof allow === 'string' ? allow : allow.join(', '));
        sendError(AEError.invalid_method, res);
    };
}

export function sanitizeMongoObj<T extends Mongoose.Document>(data: T) : any {
    try {
        const original_clean = 'toJSON' in data ? data.toJSON() : data;

        for (const prop in original_clean) {
            if (prop.startsWith('_')) {
                // @ts-ignore
                delete original_clean[prop];
            }
        }

        return original_clean;
    } catch {}

    return data;
}

export function getTokenInstanceFromString(token: string) : Promise<IToken> {
    return TokenModel.findOne({ token });
}

export function getTokensFromUser(user_id: string) : Promise<IToken[]> {
    return TokenModel.find({ user_id });
}

export function getCompleteUserFromId(user_id: string) : Promise<IUser> {
    return UserModel.findOne({ user_id });
}

export function getCompleteUserFromTwitterId(twitter_id: string) : Promise<IUser> {
    return UserModel.findOne({ twitter_id });
}

export function getCompleteUserFromTwitterScreenName(twitter_screen_name: string) : Promise<IUser> {
    return UserModel.findOne({ twitter_screen_name: { $regex: "^" + twitter_screen_name + "$", $options: "i" }});
}

export function batchTweets(ids: string[]) : Promise<ITweet[]> {
    return TweetModel.find({ id_str: { $in: ids } })
        .then((statuses: ITweet[]) => {
            const current_date_minus = new Date;
            // Expiration: 2 semaines
            current_date_minus.setDate(current_date_minus.getDate() - (2 * 7));

            // Check the tweets that are obsoletes
            statuses = statuses.filter(e => e.inserted_time.getTime() >= current_date_minus.getTime());

            // Delete obsoletes tweets
            TweetModel.deleteMany({ inserted_time: { $lte: current_date_minus } });

            // Return valids
            logger.debug(`${statuses.length} valid tweets batched from MongoDB (${ids.length} fetched)`);
            return statuses.map(s => s.toObject());
        });
}

export function batchUsers(ids: string[], as_screen_names = false) {
    let user_prom: Mongoose.DocumentQuery<ITwitterUser[], ITwitterUser, {}>;
    if (as_screen_names) {
        user_prom = TwitterUserModel.find({ screen_name: {
            $regex: new RegExp('(^' + ids.join('$)|(^') + '$)'),
            $options: "i"
        }});
    }
    else {
        user_prom = TwitterUserModel.find({ id_str: { $in: ids } });
    }

    return user_prom
        .then(users => {
            const current_date_minus = new Date;
            // Expiration: 1 jour
            current_date_minus.setDate(current_date_minus.getDate() - 1);

            // Check the tweets that are obsoletes
            users = users.filter(e => e.inserted_time.getTime() >= current_date_minus.getTime());

            // Delete obsoletes tweets
            TwitterUserModel.deleteMany({ inserted_time: { $lte: current_date_minus } });

            // Return valids
            logger.debug(`${users.length} valid Twitter users batched from MongoDB (${ids.length} fetched)`);
            return users.map(u => u.toObject() as ITwitterUser);
        });
}

export async function saveTweets(tweets: Status[]) {
    if (!tweets.length) {
        return [];
    }

    logger.debug(`Saving ${tweets.length} tweets in database.`);
    // Delete tweets in DB that are already existant
    await TweetModel.deleteMany({ id_str: { $in: tweets.map(t => t.id_str) } })

    return TweetModel.insertMany(
        tweets
            .map(e => suppressUselessTweetProperties(e))
            .map(t => ({ ...t, inserted_time: new Date }))
    );
}

export async function saveTwitterUsers(users: FullUser[]) {
    if (!users.length) {
        return [];
    }

    logger.debug(`Saving ${users.length} twitter users in database (${users.map(u => `@${u.screen_name}`)}).`);
    // Delete users in DB that are already existant (maybe useless and slow)
    await TwitterUserModel.deleteMany({ id_str: { $in: users.map(t => t.id_str) } })

    return TwitterUserModel.insertMany(
        users
            .map(u => suppressUselessTUserProperties(u))
            .map(u => ({ ...u, inserted_time: new Date }))
    );
}

export function invalidateToken(token: string) {
    return TokenModel.deleteOne({ token });
}

export function invalidateTokensFromUser(user_id: string) {
    return TokenModel.deleteMany({ user_id });
}

export function isTokenInvalid(token: string, req?: express.Request, full_payload?: JSONWebToken) {
    return getTokenInstanceFromString(token)
        .then(async model => {
            if (model) {
                // Actualise le last_use
                model.last_use = new Date;
                if (req) {
                    model.login_ip = req.connection.remoteAddress!;
                }
                // Sauvegarde sans considérer une erreur
                model.save().catch(e => e);

                // Test if token should be renewed
                if (full_payload && req) {
                    const exp = new Date(Number(full_payload.exp) * 1000);
                    const now = new Date;

                    // If token is not expired
                    if (exp.getTime() >= now.getTime()) {
                        now.setDate(now.getDate() + 14);

                        // Token expires in less than 14 days
                        if (exp.getTime() < now.getTime()) {
                            try {
                                const token = await makeTokenFromUser(
                                    full_payload.jti,
                                    full_payload.user_id,
                                    full_payload.screen_name,
                                    full_payload.login_ip
                                );

                                req.__ask_refresh__ = token;
                            } catch (e) {
                                logger.error("Unable to create renewed token:", e);
                            }
                        }
                    }
                    else {
                        return true;
                    }
                }

                return false;
            }
            return true;
        })
        .catch(() => true);
}

export async function checkToken(token: string) {
    const decoded: JSONWebToken = await new Promise((resolve, reject) => {
        JsonWebToken.verify(token, SECRET_PUBLIC_KEY, (err, data) => {
            if (err) reject(err);
            resolve(data as any);
        });
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
        JsonWebToken.sign(
            payload, // Données custom
            { key: SECRET_PRIVATE_KEY, passphrase: SECRET_PASSPHRASE }, // Clé RSA privée
            {
                algorithm: 'RS256',
                expiresIn: "90d", // 3 months durability
                issuer: "Archive Explorer Server 1",
                jwtid: id, // ID généré avec uuid
            },
            (err, encoded) => { // Quand le token est généré (ou non), accepte/rejette la promesse
                if (err) reject(err);
                else resolve(encoded as string);
            }
        );
    }) as Promise<string>;
}

export function makeTokenFromUser(jti: string, user_id: string, screen_name: string, login_ip: string) {
    return signToken({
        user_id,
        screen_name,
        login_ip
    }, jti);
}

export function createTwitterObjectFromUser(user: IUser) {
    return new TwitterLite({
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
    // @ts-expect-error
    delete tweet.favorited;
    delete tweet.place;
    // @ts-expect-error
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
    // @ts-expect-error
    delete user.entities;
    // @ts-expect-error
    delete user.listed_count;
    delete user.status;
    delete user.withheld_in_countries;
    delete user.withheld_scope;
    // @ts-expect-error
    delete user.statuses_count;
    // @ts-ignore
    delete user.follow_request_sent;
    // @ts-expect-error
    delete user.default_profile_image;
    // @ts-expect-error
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
    // Delete clouded archives
    await deleteEveryCloudedArchive(user_id);
}

export async function deleteEveryCloudedArchive(user_id: string) {
    const archives = await CloudedArchiveModel.find({ user_id }) as ICloudedArchive[];
    await Promise.all(archives.map(deleteCloudedArchive));
}

export async function deleteCloudedArchive(archive: ICloudedArchive) {
    // Delete related ZIP file then model
    await fs.promises.unlink(UPLOAD_PATH + '/' + archive.path).catch(() => {});
    await archive.remove();
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
            .then(() => console.log(`Collection ${collection} dropped.`))
            .catch(() => logger.warn(`Unable to drop collection ${collection}. (maybe it hasn't been created yet)`)));
    }

    return Promise.all(drops).then(() => db.close()).then(() => mongoose.disconnect());
}

export async function purgePartial(COLLECTIONS: any, db: any) {
    const drops: Promise<any>[] = [];
    for (const collection of Object.keys(COLLECTIONS)) {
        drops.push(db.db.dropCollection(collection)
            .then(() => console.log(`Collection ${collection} dropped.`))
            .catch(() => logger.warn(`Unable to drop collection ${collection}. (maybe it hasn't been created yet)`)));
    }

    return Promise.all(drops);
}
