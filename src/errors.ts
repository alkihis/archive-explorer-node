import { Response } from "express";

// Specify here the error internal name.
// A code will be automatically given (numeric order, the first is 1).
enum AEError {
    inexistant = 1, invalid_route, server_error, invalid_data, invalid_request,
    forbidden, invalid_token, invalid_verifier, invalid_method, twitter_error,
    twitter_credentials_expired, twitter_rate_limit, too_many_tasks, size_mismatch,
    too_many_chunks,
};

// Specify here the corresponding error message and HTTP code for the error
const errors: { [errorCode: string]: [string, number] } = {
    [AEError.inexistant]: ["The page or desired document can't be found", 404],
    [AEError.invalid_route]: ["Specified route does not exists", 404],
    [AEError.server_error]: ["Internal server error", 500],
    [AEError.invalid_data]: ["Provided data is invalid", 400],
    [AEError.invalid_request]: ["Query or URL is invalid", 400],
    [AEError.forbidden]: ["Your current credentials does not allow you to access requested document or endpoint", 403],
    [AEError.invalid_token]: ["Invalid or inexistant token, that is required to access this resource", 403],
    [AEError.invalid_verifier]: ["OAuth verifier is invalid, please renew your request with valid credentials", 400],
    [AEError.invalid_method]: ["Invalid HTTP method", 405],
    [AEError.twitter_error]: ["Twitter error. See .error for explicit details", 400],
    [AEError.twitter_credentials_expired]: ["Twitter tokens has expired or has been revoked. Please log in again.", 403],
    [AEError.twitter_rate_limit]: ["Twitter send a too many requests error. Please try again later.", 429],
    [AEError.too_many_tasks]: ["Too many tasks are already started for you. Try again later.", 429],
    [AEError.size_mismatch]: ["Sent chunks size doesn't match size originally given.", 400],
    [AEError.too_many_chunks]: ["You already sent too many chunks.", 400],
};

export default AEError;

export function sendError(code: AEError, res: Response, custom_error?: any) {
    if (String(code) in errors) {
        const e = {
            code, message: errors[code][0]
        };

        res.status(errors[code][1]).json(custom_error ? {...e, error: custom_error} : e);
    }
    else {
        sendError(AEError.server_error, res);
        throw new Error(`Invalid error code: ${code}.`);
    }
}
