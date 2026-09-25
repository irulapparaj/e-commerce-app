import type { FastifyPluginAsync, FastifyPluginOptions } from 'fastify';

const SKIP_OVERRIDE = Symbol.for('skip-override');

/**
 * Marks a plugin as non-encapsulated so its decorators and hooks apply to the parent scope.
 * This is the same mechanism fastify-plugin uses, without the extra dependency.
 */
export const sharedPlugin = <Options extends FastifyPluginOptions = Record<never, never>>(
  plugin: FastifyPluginAsync<Options>,
): FastifyPluginAsync<Options> => Object.assign(plugin, { [SKIP_OVERRIDE]: true });
