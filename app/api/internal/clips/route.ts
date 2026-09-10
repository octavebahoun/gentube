import type { NextRequest } from 'next/server';
import {
  handleClips,
  postInternal,
} from '@/lib/internal';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  return postInternal(request, handleClips);
}
