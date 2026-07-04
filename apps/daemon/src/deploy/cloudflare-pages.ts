/** @module deploy/cloudflare-pages
 *
 * Cloudflare Pages deployment-domain helpers: project-name resolution (from
 * provider metadata, from a *.pages.dev URL, or from prior deployments), the
 * provider-metadata shape, the public (metadata-stripped) deployment view, and
 * the live link-status reconciliation for pages.dev + custom domains.
 *
 * Extracted verbatim from server.ts (strangler-fig slice 5c). These are deploy
 * concerns, not HTTP-server-lifecycle concerns: they depend on deploy.ts and
 * their only consumer is routes/deploy.ts (via the ctx.deploy deps bundle) —
 * server.ts was merely a way-station. The daemon threads the same functions
 * into ctx.deploy after this move, so routes/deploy.ts is unchanged.
 *
 * Behaviour is byte-for-byte preserved; only parameter type annotations were
 * added so this module can leave server.ts's `@ts-nocheck` blanket and be
 * fully typechecked.
 */
import {
  aggregateCloudflarePagesStatus,
  checkDeploymentUrl,
  CLOUDFLARE_PAGES_PROVIDER_ID,
  cloudflarePagesProjectNameForProject,
  readCloudflarePagesDomain,
  readDeployConfig,
} from '../deploy.js';
import { listDeployments } from '../db.js';

/** Loosely-typed deployment record as persisted/returned by the deploy layer. */
type DeploymentRecord = Record<string, any>;

export const CLOUDFLARE_PAGES_PROJECT_METADATA_KEY = 'cloudflarePagesProjectName';

export function cloudflarePagesDeploymentMetadata(projectName: string) {
  const normalized = typeof projectName === 'string' ? projectName.trim() : '';
  return normalized
    ? { [CLOUDFLARE_PAGES_PROJECT_METADATA_KEY]: normalized }
    : undefined;
}

export function cloudflarePagesProjectNameFromDeployment(deployment: DeploymentRecord | null | undefined): string {
  const value = deployment?.providerMetadata?.[CLOUDFLARE_PAGES_PROJECT_METADATA_KEY];
  if (typeof value === 'string' && value.trim()) return value.trim();
  return cloudflarePagesProjectNameFromUrl(deployment?.url);
}

export function cloudflarePagesProjectNameFromUrl(rawUrl: unknown): string {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return '';
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    if (!host.endsWith('.pages.dev')) return '';
    const labels = host.slice(0, -'.pages.dev'.length).split('.').filter(Boolean);
    return labels.at(-1) || '';
  } catch {
    return '';
  }
}

export function cloudflarePagesProjectNameForDeploy(db: any, projectId: string, projectName: string, prior: DeploymentRecord | null | undefined): string {
  const priorName = cloudflarePagesProjectNameFromDeployment(prior);
  if (priorName) return priorName;

  for (const deployment of listDeployments(db, projectId)) {
    if (deployment.providerId !== CLOUDFLARE_PAGES_PROVIDER_ID) continue;
    const stableName = cloudflarePagesProjectNameFromDeployment(deployment);
    if (stableName) return stableName;
  }

  return cloudflarePagesProjectNameForProject(projectId, projectName);
}

export function publicDeployment(deployment: DeploymentRecord | null | undefined) {
  if (!deployment || typeof deployment !== 'object') return deployment;
  const { providerMetadata: _providerMetadata, ...publicShape } = deployment;
  return publicShape;
}

export function publicDeployments(deployments: DeploymentRecord[] | null | undefined) {
  return (deployments || []).map(publicDeployment);
}

export async function checkCloudflarePagesDeploymentLinks(existing: DeploymentRecord) {
  const current = existing.cloudflarePages || {};
  const projectName = current.projectName || cloudflarePagesProjectNameFromDeployment(existing);
  const config = await readDeployConfig(CLOUDFLARE_PAGES_PROVIDER_ID);
  const pagesDevUrl = current.pagesDev?.url || existing.url;
  const pagesDevResult = await checkDeploymentUrl(pagesDevUrl);
  const pagesDev = {
    ...(current.pagesDev || {}),
    url: pagesDevUrl,
    status: pagesDevResult.reachable ? 'ready' : pagesDevResult.status || 'link-delayed',
    statusMessage: pagesDevResult.reachable
      ? 'Public link is ready.'
      : pagesDevResult.statusMessage || current.pagesDev?.statusMessage || 'Cloudflare Pages is still preparing the pages.dev link.',
    reachableAt: pagesDevResult.reachable ? Date.now() : current.pagesDev?.reachableAt,
  };
  let customDomain = current.customDomain;
  if (customDomain?.url && customDomain.status !== 'conflict') {
    let pagesDomain = null;
    if (config?.token && config?.accountId && projectName) {
      try {
        pagesDomain = await readCloudflarePagesDomain({ ...config, projectName }, customDomain.hostname);
      } catch {
        pagesDomain = null;
      }
    }
    const customResult = await checkDeploymentUrl(customDomain.url);
    const pagesDomainStatus = pagesDomain?.status || customDomain.pagesDomainStatus;
    const failedByApi = ['error', 'blocked', 'deactivated'].includes(String(pagesDomainStatus || '').toLowerCase());
    const activeByApi = String(pagesDomainStatus || '').toLowerCase() === 'active';
    const readyByReachability = customResult.reachable && activeByApi;
    customDomain = {
      ...customDomain,
      domainStatus: pagesDomain
        ? pagesDomain.status === 'active'
          ? 'active'
          : failedByApi
            ? 'failed'
            : 'pending'
        : customDomain.domainStatus,
      pagesDomainStatus,
      validationData: pagesDomain?.validation_data ?? customDomain.validationData,
      verificationData: pagesDomain?.verification_data ?? customDomain.verificationData,
      status: readyByReachability
        ? 'ready'
        : customDomain.status === 'failed' || failedByApi
          ? 'failed'
          : 'pending',
      statusMessage: readyByReachability
        ? 'Custom domain is ready.'
        : failedByApi
          ? 'Cloudflare Pages reported a custom-domain error.'
        : customResult.statusMessage || customDomain.statusMessage || 'Custom domain is still being prepared.',
    };
  }
  const cloudflarePages = {
    ...current,
    projectName,
    pagesDev,
    ...(customDomain ? { customDomain } : {}),
  };
  const aggregate = aggregateCloudflarePagesStatus(pagesDev, customDomain);
  return {
    url: pagesDev.url,
    status: aggregate.status,
    statusMessage: aggregate.statusMessage,
    cloudflarePages,
    providerMetadata: {
      ...(existing.providerMetadata || {}),
      cloudflarePages,
    },
  };
}
