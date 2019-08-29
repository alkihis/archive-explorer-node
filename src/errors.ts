import { Response } from "express";

// Specify here the error internal name. 
// A code will be automatically given (numeric order, the first is 1).
enum AEError {
    inexistant = 1, invalid_route, server_error, invalid_data, invalid_request,
    forbidden, invalid_token, invalid_verifier, invalid_method,
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
};

export default AEError;

export function sendError(code: AEError, res: Response) {
    if (String(code) in errors) {
        res.status(errors[code][1]).json({
            code, message: errors[code][0]
        });
    }
    else {
        sendError(AEError.server_error, res);
        throw new Error(`Invalid error code: ${code}.`);
    }
}
