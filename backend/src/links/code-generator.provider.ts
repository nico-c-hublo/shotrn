import type { Provider } from '@nestjs/common';
import { generateCode } from './short-code';

/** Injected so tests can force a collision; production always draws from `generateCode`. */
export const CODE_GENERATOR = Symbol('CODE_GENERATOR');
export type CodeGenerator = () => string;

export const codeGeneratorProvider: Provider = {
  provide: CODE_GENERATOR,
  useValue: (() => generateCode()) satisfies CodeGenerator,
};
