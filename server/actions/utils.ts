'use server';

import { cookies } from "next/headers";
import { v4 as uuidv4 } from 'uuid';

export async function ensureUseId() {
    const cookieStore = await cookies();
    let userId = cookieStore.get('userId')?.value || '';
    if (!userId) {
        const newId = uuidv4();
        cookieStore.set('userId', newId);
        userId = cookieStore.get('userId')?.value || '';
    }

    return userId;
}
