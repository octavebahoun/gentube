import type { NextRequest } from 'next/server';
import {
  handleImages,
  postInternal,
} from '@/lib/internal';

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  return postInternal(request, handleImages);
}
