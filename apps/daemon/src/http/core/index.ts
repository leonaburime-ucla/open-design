/** @module core/index
 * Foundational layer: `Result`/`ok`/`err` and the route-spec types (`JsonRouteSpec`,
 * `InputParser`, `Handler`, `HttpMethod`, `RouteInputContext`) that every other subdirectory
 * depends on. This is the kernel every sibling may import directly; core itself never imports
 * from a sibling subdirectory.
 */
export * from './types.js';
