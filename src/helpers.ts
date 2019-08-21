import { UserModel, TokenModel, IUser } from "./models";

export function getUserFromToken(token: string) {
    return TokenModel.findOne({ token });
}

export function getCompleteUserFromId(user_id: string) {
    return UserModel.findOne({ user_id });
}

export function invalidateToken(token: string) {
    return TokenModel.remove({ token });
}

export function invalidateTokensFromUser(user_id: string) {
    return TokenModel.remove({ user_id });
}

export function removeUser(user: IUser) {
    invalidateTokensFromUser(user.user_id);
    return user.remove();
}
