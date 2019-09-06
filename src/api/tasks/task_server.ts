import io from '../../index';
import { Socket } from 'socket.io';
import { users_to_tasks, tasks_to_objects } from './Task';
import { checkToken } from '../../helpers';
import logger from '../../logger';

// Task server (uses socket.io)

// Key is socket
export const socket_to_tasks: Map<Socket, Set<BigInt>> = new Map;

export function startIo() {
    io.on('connection', socket => {
        // Souscription à une tâche (progression)
        socket.on('task', async (id: string, user_token: string) => {
            // Verify user and obtain user id from token...
            try {
                logger.debug(`User ask subscription to ${id}, verifing token...`);
                var payload = await checkToken(user_token);
            } catch (e) { }
            
            if (!payload || !payload.user_id) {
                socket.emit('error', { id, msg: "Can't verify token or user is invalid" });
                return;
            }

            const user_id = payload.user_id;
            logger.debug(`Logged user ${user_id} subscribing to task ${id}`);

            if (id) {
                try {
                    var id_int = BigInt(id);
                } catch (e) {
                    socket.emit('error', { id, msg: "Task ID is invalid" });
                    return;
                } 
    
                // Récupération des tâches en cours pour cet utilisateur
                const user_tasks = users_to_tasks.get(user_id);
    
                // Si elle appartient à cet utilisateur
                if (user_tasks && user_tasks.has(id_int)) {
                    // Si la tâche existe encore
                    const task = tasks_to_objects.get(id_int);
        
                    // Si elle existe
                    if (task) {
                        // Si ce socket n'est pas déjà inscrit
                        if (!socket_to_tasks.has(socket)) {
                            socket_to_tasks.set(socket, new Set);
                        }
                        
                        socket_to_tasks.get(socket)!.add(id_int);
        
                        task.subscribe(socket);
                    }
                }
            }
        });

        socket.on('remove', async (id: string, user_token: string) => {
            // Verify user and obtain user id from token...
            try {
                logger.debug(`User ask unsub to ${id}, verifing token...`);
                var payload = await checkToken(user_token);
            } catch (e) { }

            if (!payload || !payload.user_id) {
                socket.emit('error', { id, msg: "Can't verify token or user is invalid" });
                return;
            }

            const user_id = payload.user_id;
            logger.debug(`Logged user ${user_id} unsub task ${id}`);

            if (id) {
                try {
                    var id_int = BigInt(id);
                } catch (e) {
                    socket.emit('error', { id, msg: "Task ID is invalid" });
                    return;
                } 

                // Récupération des tâches en cours pour cet utilisateur
                const user_tasks = users_to_tasks.get(user_id);

                // Si elle appartient à cet utilisateur
                if (user_tasks && user_tasks.has(id_int)) {
                    // Si la tâche existe encore
                    const task = tasks_to_objects.get(id_int);

                    // Si elle existe
                    if (task) {
                        // Si ce socket n'est pas déjà inscrit
                        if (!socket_to_tasks.has(socket)) {
                            return;
                        }
                        
                        socket_to_tasks.get(socket)!.delete(id_int);

                        task.unsubscribe(socket);
                    }
                }
            }
        });
    
        // Déconnexion du socket
        socket.on('disconnect', () => {
            const tasks = socket_to_tasks.get(socket);
            if (tasks) {
                // Suppression de toutes les tâches affectées à ce socket
                for (const t of tasks) {
                    const real_t = tasks_to_objects.get(t);
    
                    if (real_t) {
                        real_t.unsubscribe(socket);
                    }
                }
            }
    
            socket_to_tasks.delete(socket);
        });
    });
}
