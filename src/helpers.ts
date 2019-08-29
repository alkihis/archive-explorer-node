import { UserModel, TokenModel, IUser } from "./models";
import { SECRET_PRIVATE_KEY, SECRET_PASSPHRASE } from "./constants";
import jsonwebtoken from 'jsonwebtoken';
import twitterLite from "twitter-lite";
import { CONSUMER_KEY, CONSUMER_SECRET } from "./twitter_const";
import express from 'express';
import Mongoose from "mongoose";

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

export function invalidateToken(token: string) {
    return TokenModel.remove({ token });
}

export function invalidateTokensFromUser(user_id: string) {
    return TokenModel.remove({ user_id });
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
                model.save();

                return false;
            }
            return true;
        })
        .catch(() => true);
}

export function removeUser(user: IUser) {
    invalidateTokensFromUser(user.user_id);
    return user.remove();
}

export interface TokenPayload {
    user_id: string, 
    screen_name: string,
    login_ip: string
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