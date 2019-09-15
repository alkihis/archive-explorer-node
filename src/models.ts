import mongoose from 'mongoose';
import { Status, FullUser } from 'twitter-d';

export interface IUser extends mongoose.Document {
    oauth_token: string,
    oauth_token_secret: string,
    user_id: string,
    last_login: Date,
    twitter_name: string,
    twitter_screen_name: string,
    twitter_id: string,
    profile_picture: string,
    created_at: Date,
}  
const user_schema = new mongoose.Schema({
    oauth_token: String,
    oauth_token_secret: String,
    user_id: String,
    last_login: Date,
    twitter_name: String,
    twitter_screen_name: String,
    twitter_id: String,
    profile_picture: String,
    created_at: Date,
});

export interface IToken extends mongoose.Document {
    user_id: string,
    token: string,
    login_ip: string,
    date: Date,
    last_use: Date
} 
const token_schema = new mongoose.Schema({
    user_id: String,
    token: String,
    login_ip: String,
    date: Date,
    last_use: Date
});

export type ITweetPartial = mongoose.Document & Status;

export interface ITweet extends ITweetPartial {
    inserted_time: Date;
}

const tweet_schema = new mongoose.Schema({
    id_str: String,
    inserted_time: Date,
    user: {}
}, { strict: false });

export type IUserPartial = mongoose.Document & FullUser;

export interface ITwitterUser extends IUserPartial {
    inserted_time: Date;
}

const user_twitter_schema = new mongoose.Schema({
    id_str: String,
    inserted_time: Date,
}, { strict: false });

export const UserModel = mongoose.model<IUser>('UserModel', user_schema, 'ae_user'); 

export const TokenModel = mongoose.model<IToken>('TokenModel', token_schema, 'ae_token'); 

export const TweetModel = mongoose.model<ITweet>('TweetModel', tweet_schema, 'ae_tweets'); 

export const TwitterUserModel = mongoose.model<ITwitterUser>('TwitterUserModel', user_twitter_schema, 'ae_twitter_users'); 

export const COLLECTIONS = {
    'ae_user': UserModel,
    'ae_token': TokenModel,
    'ae_tweets': TweetModel,
    'ae_twitter_users': TwitterUserModel
};
