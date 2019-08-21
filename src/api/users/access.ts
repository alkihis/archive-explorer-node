import { Router } from "express";
import twitter from 'twitter-lite';
import { CONSUMER_KEY, CONSUMER_SECRET } from "../../twitter_const";
import AEError, { sendError } from "../../errors";
import { getCompleteUserFromTwitterId, signToken } from "../../helpers";
import { IUser, UserModel, TokenModel } from "../../models";
import { FullUser as TwitterUser } from 'twitter-d';
import uuid = require("uuid");

// Meant to be called when oauth callback is done
const route = Router();

route.post('/', (req, res) => {
    if (
        req.body.oauth_token && 
        req.body.oauth_token_secret && 
        req.body.oauth_verifier
    ) {
        const t = new twitter({
            consumer_key: CONSUMER_KEY,
            consumer_secret: CONSUMER_SECRET
        });

        // Encapsule la fonction async pour express
        (async () => {
            try {
                var access = await t.getAccessToken({
                    key: req.body.oauth_token,
                    secret: req.body.oauth_token_secret,
                    verifier: req.body.oauth_verifier
                });
            } catch (e) {
                sendError(AEError.invalid_verifier, res);
                return;
            }
    
            // On a les données ! il faut vérifier que l'utilisateur existe
            var user: IUser | null;
            try {
                user = await getCompleteUserFromTwitterId(access.user_id);
            } catch (e) {
                // On doit créer l'utilisateur
                user = null;
            }

            // Obtention des données pour cet utilisateur
            const tmp_user = new twitter({
                consumer_key: CONSUMER_KEY,
                consumer_secret: CONSUMER_SECRET,
                access_token_key: access.oauth_token,
                access_token_secret: access.oauth_token_secret
            });

            // Obtention des credentials
            let t_user: TwitterUser;
            try {
                t_user = await tmp_user.get('account/verify_credentials');
            } catch (e) {
                // invalid user
                sendError(AEError.invalid_verifier, res);
                return;
            }

            let token: string;
            const uniq_id = uuid.v4();

            // On génère un JWT
            try {
                token = await signToken({ 
                    user_id: t_user.id_str, 
                    screen_name: t_user.screen_name,
                    login_ip: req.connection.remoteAddress
                }, uniq_id);
            } catch (e) {
                sendError(AEError.server_error, res);
                return;
            }

            // Puis on enregistre le token en BDD !
            new TokenModel({
                token: uniq_id,
                user_id: t_user.id_str,
                date: new Date,
                last_use: new Date
            });

            if (user === null) {
                // Création
                // On enregistre l'utilisateur
                user = new UserModel({
                    oauth_token: access.oauth_token,
                    oauth_token_secret: access.oauth_token_secret,
                    twitter_id: access.user_id,
                    twitter_name: t_user.name,
                    twitter_screen_name: t_user.screen_name,
                    profile_picture: t_user.profile_image_url_https,
                    user_id: t_user.id_str,
                    last_login: new Date,
                });
            }
            else {
                // Mise à jour de l'utilisateur avec les nouvelles données
                user.twitter_name = t_user.name;
                user.profile_picture = t_user.profile_image_url_https;
                user.oauth_token = access.oauth_token;
                user.oauth_token_secret = access.oauth_token_secret;
                user.twitter_screen_name = t_user.screen_name;
                user.last_login = new Date;
                user.save();
            }

            // L'utilisateur est prêt !
            res.json({
                status: true,
                token
            });
        })().catch(() => {
            sendError(AEError.server_error, res);
        });
    }
    else {
        sendError(AEError.invalid_data, res);
    }
});

export default route;
