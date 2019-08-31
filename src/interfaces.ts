export interface JSONWebTokenPartial {
    /** Issued at */
    iat: string;
    /** Expiration (timestamp) */
    exp: string;
    /** Issuer */
    iss: string;
}

export interface TokenPayload {
    user_id: string, 
    screen_name: string,
    login_ip: string
}

export type JSONWebToken = JSONWebTokenPartial & TokenPayload;
