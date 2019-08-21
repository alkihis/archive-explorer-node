export interface JSONWebToken {
    user_id: string;
    screen_name: string;
    login_ip: string;
    /** Issued at */
    iat: string;
    /** Expiration (timestamp) */
    exp: string;
    /** Issuer */
    iss: string;
}