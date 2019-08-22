import { TokenPayload } from "./helpers";

export interface JSONWebTokenPartial {
    /** Issued at */
    iat: string;
    /** Expiration (timestamp) */
    exp: string;
    /** Issuer */
    iss: string;
}

export type JSONWebToken = JSONWebTokenPartial & TokenPayload;
