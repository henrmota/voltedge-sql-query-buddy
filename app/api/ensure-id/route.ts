import { cookies } from "next/headers";
import { v4 as uuidv4 } from "uuid";

export async function GET() {
  const cookieStore = await cookies();
  let userId = cookieStore.get("userId")?.value;

  if (!userId) {
    userId = uuidv4();
    cookieStore.set("userId", userId);
  }

  return Response.json({ userId });
}