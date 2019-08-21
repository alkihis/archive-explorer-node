export interface JSONWebToken {
    user_id: string;
    /** Issued at */
    iat: string;
    /** Expiration (timestamp) */
    exp: string;
    /** Issuer */
    iss: string;
}