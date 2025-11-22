export async function sendMessage(message: string, conversationId?: number) {
  const userId = document.cookie.split('; ').find(row => row.startsWith('userId='))?.split('=')[1] || '';
  const response = await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + '/chat', {
    method: 'POST',
    headers: new Headers({
      'Content-Type': 'application/json',
      'Identifier': userId || '',
    }),
    body: JSON.stringify({
      message,
      ...(conversationId && conversationId !== -1 && { conversationId })
    }),
  });

  return response;
}

export async function getConversation(conversationId: number) {
  const userId = document.cookie.split('; ').find(row => row.startsWith('userId='))?.split('=')[1] || '';
  const response = await fetch(process.env.NEXT_PUBLIC_BACKEND_API_URL + '/chat/' + conversationId, {
    method: 'GET',
    headers: new Headers({
      'Content-Type': 'application/json',
      'Identifier': userId || '',
    }),
  });

  return response;
}
