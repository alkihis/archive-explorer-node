import crypto from 'crypto';
import Fetch from 'cross-fetch';
const OAuth = require('oauth-1.0a');
import querystring from 'querystring';

const getUrl = (subdomain: string, endpoint = '1.1') =>
    `https://${subdomain}.twitter.com/${endpoint}`;

const createOauthClient = ({ key, secret }: { key: string, secret: string }) => {
    const client = OAuth({
        consumer: { key, secret },
        signature_method: 'HMAC-SHA1',
        hash_function(baseString: string, key: string) {
            return crypto
                .createHmac('sha1', key)
                .update(baseString)
                .digest('base64');
        },
    });

    return client;
};

const defaults: {
    subdomain?: string,
    consumer_key?: string | null,
    consumer_secret?: string | null,
    access_token_key?: string | null,
    access_token_secret?: string | null,
    bearer_token?: string | null,
} = {
    subdomain: 'api',
    consumer_key: null,
    consumer_secret: null,
    access_token_key: null,
    access_token_secret: null,
    bearer_token: null,
};

type TwitterConstructType = typeof defaults;

// Twitter expects POST body parameters to be URL-encoded: https://developer.twitter.com/en/docs/basics/authentication/guides/creating-a-signature
// However, some endpoints expect a JSON payload - https://developer.twitter.com/en/docs/direct-messages/sending-and-receiving/api-reference/new-event
// It appears that JSON payloads don't need to be included in the signature,
// because sending DMs works without signing the POST body
const JSON_ENDPOINTS = [
    'direct_messages/events/new',
    'direct_messages/welcome_messages/new',
    'direct_messages/welcome_messages/rules/new',
];

const baseHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
};

function percentEncode(string: string) {
    // From OAuth.prototype.percentEncode
    return string
        .replace(/!/g, '%21')
        .replace(/\*/g, '%2A')
        .replace(/'/g, '%27')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29');
}

export default class Twitter {
    public authType: string;
    public client: any;
    public token: { key: string, secret: string };
    public url: string;
    public oauth: string;
    public config: TwitterConstructType;

    constructor(options: TwitterConstructType) {
        const config = Object.assign({}, defaults, options);
        this.authType = config.bearer_token ? 'App' : 'User';
        this.client = createOauthClient({
            key: config.consumer_key!,
            secret: config.consumer_secret!,
        });

        this.token = {
            key: config.access_token_key!,
            secret: config.access_token_secret!,
        };

        this.url = getUrl(config.subdomain!);
        this.oauth = getUrl(config.subdomain!, 'oauth');
        this.config = config;
    }

    /**
     * Parse the JSON from a Response object and add the Headers under `_headers`
     * @param {Response} response - the Response object returned by Fetch
     * @return {Promise<object>}
     * @private
     */
    static _handleResponse(response: Response) {
        // @ts-ignore
        const headers = response.headers.raw(); // TODO: see #44
        // Return empty response on 204 "No content"
        if (response.status === 204)
            return {
                _headers: headers,
            };
        // Otherwise, parse JSON response
        return response.json().then(res => {
            res._headers = headers; // TODO: this creates an array-like object when it adds _headers to an array response
            return res;
        });
    }

    async getBearerToken() {
        const headers = {
            Authorization:
                'Basic ' +
                Buffer.from(
                    this.config.consumer_key + ':' + this.config.consumer_secret
                ).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        };

        const results = await Fetch('https://api.twitter.com/oauth2/token', {
            method: 'POST',
            body: 'grant_type=client_credentials',
            headers,
        }).then(Twitter._handleResponse);

        return results;
    }

    async getRequestToken(twitterCallbackUrl: string) {
        const requestData = {
            url: `${this.oauth}/request_token`,
            method: 'POST',
        };

        let parameters = {};
        if (twitterCallbackUrl) parameters = { oauth_callback: twitterCallbackUrl };
        if (parameters) requestData.url += '?' + querystring.stringify(parameters);

        const headers = this.client.toHeader(
            this.client.authorize(requestData, {})
        );

        const results = await Fetch(requestData.url, {
            method: 'POST',
            headers: Object.assign({}, baseHeaders, headers),
        })
            .then(res => res.text())
            .then(txt => querystring.parse(txt));

        return results;
    }

    async getAccessToken(options: { verifier: string, key: string, secret: string }) {
        const requestData = {
            url: `${this.oauth}/access_token`,
            method: 'POST',
        };

        let parameters = { oauth_verifier: options.verifier };
        if (parameters) requestData.url += '?' + querystring.stringify(parameters);

        const headers = this.client.toHeader(
            this.client.authorize(requestData, {
                key: options.key,
                secret: options.secret,
            })
        );

        const results = await Fetch(requestData.url, {
            method: 'POST',
            headers: Object.assign({}, baseHeaders, headers),
        })
            .then(res => res.text())
            .then(txt => querystring.parse(txt));

        return results;
    }

    /**
     * Construct the data and headers for an authenticated HTTP request to the Twitter API
     * @param {string} method - 'GET' or 'POST'
     * @param {string} resource - the API endpoint
     * @param {object} parameters
     * @param {boolean} rawRequest
     * @return {{requestData: {url: string, method: string}, headers: ({Authorization: string}|OAuth.Header)}}
     * @private
     */
    _makeRequest(method: string, resource: string, parameters?: any, rawRequest = false) {
        const requestData: any = {
            url: rawRequest ? resource : `${this.url}/${resource}.json`,
            method,
        };
        if (parameters)
            if (method === 'POST') requestData.data = parameters;
            else requestData.url += '?' + querystring.stringify(parameters);

        let headers = {};
        if (this.authType === 'User') {
            headers = this.client.toHeader(
                this.client.authorize(requestData, this.token)
            );
        } else {
            headers = {
                Authorization: `Bearer ${this.config.bearer_token}`,
            };
        }
        return {
            requestData,
            headers,
        };
    }

    /**
     * Fetch a DM image from the given URL.
     * @param {string} url 
     * @returns {Response}
     */
    dmImage(url: string) {
        const { requestData, headers } = this._makeRequest(
            'GET',
            url,
            undefined,
            true
        );

        return Fetch(requestData.url, { headers });
    }

    /**
     * Send a GET request
     * @param {string} resource - endpoint, e.g. `followers/ids`
     * @param {object} [parameters] - optional parameters
     * @returns {Promise<object>} Promise resolving to the response from the Twitter API.
     *   The `_header` property will be set to the Response headers (useful for checking rate limits)
     */
    get(resource: string, parameters?: any) {
        const { requestData, headers } = this._makeRequest(
            'GET',
            resource,
            parameters
        );

        return Fetch(requestData.url, { headers })
            .then(Twitter._handleResponse)
            .then(results =>
                'errors' in results ? Promise.reject(results) : results
            );
    }

    /**
     * Send a DELETE request
     * @param {string} resource - endpoint, e.g. `followers/ids`
     * @param {object} [parameters] - optional parameters
     * @returns {Promise<object>} Promise resolving to the response from the Twitter API.
     *   The `_header` property will be set to the Response headers (useful for checking rate limits)
     */
    delete(resource: string, parameters?: any) {
        const { requestData, headers } = this._makeRequest(
            'DELETE',
            resource,
            parameters
        );

        return Fetch(requestData.url, { headers })
            .then(Twitter._handleResponse)
            .then(results =>
                'errors' in results ? Promise.reject(results) : results
            );
    }

    /**
     * Send a POST request
     * @param {string} resource - endpoint, e.g. `users/lookup`
     * @param {object} body - POST parameters object.
     *   Will be encoded appropriately (JSON or urlencoded) based on the resource
     * @returns {Promise<object>} Promise resolving to the response from the Twitter API.
     *   The `_header` property will be set to the Response headers (useful for checking rate limits)
     */
    post(resource: string, body?: any) {
        const { requestData, headers } = this._makeRequest(
            'POST',
            resource,
            JSON_ENDPOINTS.includes(resource) ? null : body // don't sign JSON bodies; only parameters
        );

        const postHeaders = Object.assign({}, baseHeaders, headers);
        if (JSON_ENDPOINTS.includes(resource)) {
            body = JSON.stringify(body);
        } else {
            body = percentEncode(querystring.stringify(body));
            postHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
        }

        return Fetch(requestData.url, {
            method: 'POST',
            headers: postHeaders,
            body,
        })
            .then(Twitter._handleResponse)
            .then(results =>
                'errors' in results ? Promise.reject(results) : results
            );
    }
}

module.exports = Twitter;
