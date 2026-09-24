import type { Provider } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { createShortCodec, type ShortCodec } from './short-code';

export const SHORT_CODEC = Symbol('SHORT_CODEC');
export type { ShortCodec };

export const shortCodecProvider: Provider = {
  provide: SHORT_CODEC,
  inject: [ENV],
  useFactory: (env: Env): ShortCodec => createShortCodec(env.sqidsAlphabet),
};
