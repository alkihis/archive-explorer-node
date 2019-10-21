declare module 'twitter-lite' {
    export interface AccessCredentials {
        oauth_token: string,
        oauth_token_secret: string,
        user_id: string,
        screen_name: string
    }

    export interface TwitterStream {
        on: (event: string, callback: Function) => TwitterStream;
        destroy: () => void;
    }

    export default class {
        constructor(options: {
            subdomain?: string,
            consumer_key?: string, // from Twitter.
            consumer_secret?: string, // from Twitter.
            access_token_key?: string, // from your User (oauth_token)
            access_token_secret?: string, // from your User (oauth_token_secret)
            bearer_token?: string
        });

        get(url: string, parameters?: { [key: string]: any }): Promise<any>;
        delete(url: string, parameters?: { [key: string]: any }): Promise<any>;
        post(url: string, parameters?: { [key: string]: any }): Promise<any>;

        stream(url: string, parameters?: { [key: string]: any }): TwitterStream;

        getBearerToken(): Promise<{ access_token: string, access_token_secret: string }>;
        getRequestToken(callback_url: string): Promise<{ oauth_token: string, oauth_token_secret: string }>;
        getAccessToken(options: { key: string, secret: string, verifier: string }): Promise<AccessCredentials>;
    }
}