import io from '../../index';
import { Socket } from 'socket.io';
import { users_to_tasks, tasks_to_objects } from './Task';

// Task server (uses socket.io)

// Key is socket
export const socket_to_tasks: Map<Socket, Set<BigInt>> = new Map;

export function startIo() {
    io.on('connection', socket => {
        // Souscription à une tâche (progression)
        socket.on('task', (id: string, user_token: string) => {
            // Verify user and obtain user id from token...
            // TODO
            const user_id = user_token;
    
            if (id) {
                try {
                    var id_int = BigInt(id);
                } catch (e) {
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
                        if (!socket_to_tasks.has(socket)) {
                            socket_to_tasks.set(socket, new Set);
                        }
                        
                        socket_to_tasks.get(socket)!.add(id_int);
        
                        task.subscribe(socket);
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
