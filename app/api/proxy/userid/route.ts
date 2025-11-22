import { NextApiRequest, NextApiResponse } from 'next';
import { v4 as uuidv4 } from 'uuid';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  let userId = req.cookies.userId;
  if (!userId) {
    userId = uuidv4();
    res.setHeader(
      'Set-Cookie',
      `userId=${userId}; Path=/; HttpOnly; SameSite=Lax`
    );
  }
  res.status(200).json({ userId });
}
