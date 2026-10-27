import { api } from ".";

export async function getUser() {
    const response = await api.get('/profile/me');
    return response.data;
}
