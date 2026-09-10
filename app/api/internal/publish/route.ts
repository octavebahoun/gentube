import type { NextRequest } from 'next/server';
import {
  handlePublish,
  postInternal,
} from '@/lib/internal';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  return postInternal(request, handlePublish);
}
