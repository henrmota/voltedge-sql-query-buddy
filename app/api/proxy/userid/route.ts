import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

export async function GET(req: NextRequest) {
  let userId = req.cookies.get('userId')?.value;
  
  if (!userId) {
    userId = uuidv4();
    const response = NextResponse.json({ userId });
    response.cookies.set('userId', userId, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    });
    return response;
  }
  
  return NextResponse.json({ userId });
}
