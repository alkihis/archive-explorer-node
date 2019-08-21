import mongoose from 'mongoose';

export interface IUser extends mongoose.Document {
    oauth_token: string,
    oauth_token_secret: string,
    user_id: string,
    last_login: Date,
    twitter_name: string,
    twitter_screen_name: string,
    twitter_id: string,
    profile_picture: string
}  
const user_schema = new mongoose.Schema({
    oauth_token: String,
    oauth_token_secret: String,
    user_id: String,
    last_login: Date,
    twitter_name: String,
    twitter_screen_name: String,
    twitter_id: String,
    profile_picture: String
});

export interface IToken extends mongoose.Document {
    user_id: string,
    token: string,
    date: Date
} 
const token_schema = new mongoose.Schema({
    user_id: String,
    token: String,
    date: Date
});

export const UserModel = mongoose.model<IUser>('UserModel', user_schema, 'ae_user'); 

export const TokenModel = mongoose.model<IToken>('TokenModel', token_schema, 'ae_token'); 
