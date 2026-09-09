import type { NextRequest } from 'next/server';
import {
  INTERNAL_ROUTE_MAX_DURATION,
  handleStatus,
  postInternal,
} from '@/lib/internal';

export const maxDuration = INTERNAL_ROUTE_MAX_DURATION;

export async function POST(request: NextRequest) {
  return postInternal(request, handleStatus);
}
