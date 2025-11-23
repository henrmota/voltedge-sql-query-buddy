import Chat from "@/components/Chat";
import { callGetConversations } from "@/server/actions/conversations";
import { handleGetUserInfo } from "@/server/actions/user";
import { redirect } from 'next/navigation';

// Force dynamic rendering and disable caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Home() {
  const res = await fetch("http://localhost:3001/api/ensure-id", {
    cache: "no-store",
  });

  const { userId } = await res.json(); 
  // Check if preferences are properly configured
  const { preferences } = await handleGetUserInfo(userId);

  
  if (!preferences.model || !preferences.key) {
    redirect('/setup');
  }

  const conversations = await callGetConversations();

  return (
    <Chat conversations={conversations} preferences={preferences} />
  );
}

