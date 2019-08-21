import { UserModel, TokenModel, IUser } from "./models";
import { SECRET_PRIVATE_KEY } from "./constants";
import jsonwebtoken from 'jsonwebtoken';
import twitterLite from "twitter-lite";
import { CONSUMER_KEY, CONSUMER_SECRET } from "./twitter_const";

export function getUserFromToken(token: string) {
    return TokenModel.findOne({ token });
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

export function isTokenInvalid(token: string) {
    return getUserFromToken(token)
        .then(model => {
            if (model) {
                // Actualise le last_use
                model.last_use = new Date;
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

export function signToken(payload: any, id: string) {
    return new Promise((resolve, reject) => {
        jsonwebtoken.sign(
            payload, 
            SECRET_PRIVATE_KEY, 
            { 
                algorithm: 'RS256', 
                expiresIn: "365d", 
                issuer: "Archive Explorer Server 1", 
                jwtid: id
            }, 
            (err, encoded) => {
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