const path = require('path');
const { transformBreadcrumbs } = require('../../src/utils/setup/transform-breadcrumbs.js');
const { baseUrl } = require('../../src/utils/base-url');
const { saveAssetFiles, saveStaticFiles } = require('../../src/utils/setup/save-asset-files');
const { validateEnvVariables } = require('../../src/utils/setup/validate-env-variables');
const { getNestedValue } = require('../../src/utils/get-nested-value');
const { removeNestedValue } = require('../../src/utils/remove-nested-value.js');
const { getPageSlug } = require('../../src/utils/get-page-slug');
const { manifestMetadata, siteMetadata } = require('../../src/utils/site-metadata');
const { assertTrailingSlash } = require('../../src/utils/assert-trailing-slash');
const { constructPageIdPrefix } = require('../../src/utils/setup/construct-page-id-prefix');
const { manifestDocumentDatabase, stitchDocumentDatabase } = require('../../src/init/DocumentDatabase.js');

// different types of references
const PAGES = [];

// in-memory object with key/value = filename/document
let RESOLVED_REF_DOC_MAPPING = {};

const assets = new Map();

let db;

let isAssociatedProduct = false;
const associatedReposInfo = {};

// Creates node for RemoteMetadata, mostly used for Embedded Versions. If no associated products
// or data are found, the node will be null
const createRemoteMetadataNode = async ({ createNode, createNodeId, createContentDigest }) => {
  // fetch associated child products
  const productList = manifestMetadata?.associated_products || [];
  await Promise.all(
    productList.map(async (product) => {
      associatedReposInfo[product.name] = await db.stitchInterface.fetchRepoBranches(product.name);
    })
  );
  // check if product is associated child product
  try {
    const umbrellaProduct = await db.stitchInterface.getMetadata({
      'associated_products.name': siteMetadata.project,
    });
    isAssociatedProduct = !!umbrellaProduct;
  } catch (e) {
    console.log('No umbrella product found. Not an associated product.');
    isAssociatedProduct = false;
  }

  // get remote metadata for updated ToC in Atlas
  try {
    const filter = {
      project: manifestMetadata.project,
      branch: manifestMetadata.branch,
    };
    if (isAssociatedProduct || manifestMetadata?.associated_products?.length) {
      filter['is_merged_toc'] = true;
    }
    const findOptions = {
      sort: { build_id: -1 },
    };
    const remoteMetadata = await db.stitchInterface.getMetadata(filter, findOptions);

    createNode({
      children: [],
      id: createNodeId('remoteMetadata'),
      internal: {
        contentDigest: createContentDigest(remoteMetadata),
        type: 'RemoteMetadata',
      },
      parent: null,
      remoteMetadata: remoteMetadata,
    });
  } catch (e) {
    console.error('Error while fetching metadata from Atlas, falling back to manifest metadata');
    console.error(e);
  }
};

const atlasAdminChangelogS3Prefix = 'https://mongodb-mms-prod-build-server.s3.amazonaws.com/openapi/changelog';

const fetchChangelogData = async (runId, versions) => {
  try {
    /* Using metadata runId, fetch OpenAPI Changelog full change list */
    const changelogResp = await fetch(`${atlasAdminChangelogS3Prefix}/${runId}/changelog.json`);
    const changelog = await changelogResp.json();

    /* Aggregate all Resources in changelog for frontend filter */
    const resourcesListSet = new Set();
    changelog.forEach((release) =>
      release.paths.forEach(({ httpMethod, path }) => resourcesListSet.add(`${httpMethod} ${path}`))
    );
    const changelogResourcesList = Array.from(resourcesListSet);

    /* Fetch most recent Resource Versions' diff */
    const mostRecentResourceVersions = versions.slice(-2);
    const mostRecentDiffLabel = mostRecentResourceVersions.join('_');
    const mostRecentDiffResp = await fetch(`${atlasAdminChangelogS3Prefix}/${runId}/${mostRecentDiffLabel}.json`);
    const mostRecentDiffData = await mostRecentDiffResp.json();

    return {
      changelog,
      changelogResourcesList,
      mostRecentDiff: {
        mostRecentDiffLabel,
        mostRecentDiffData,
      },
    };
  } catch (error) {
    console.warn('Changelog error: Most recent runId not successful. Using last successful runId to build Changelog.');
    throw error;
  }
};

/* Creates node for ChangelogData, cuyrrently only used for OpenAPI Changelog in cloud-docs. */
const createOpenAPIChangelogNode = async ({ createNode, createNodeId, createContentDigest }) => {
  try {
    /* Fetch OpenAPI Changelog metadata */
    const indexResp = await fetch(`${atlasAdminChangelogS3Prefix}/prod.json`);
    const index = await indexResp.json();

    const { runId, versions } = index;

    if (!runId || typeof runId !== 'string')
      throw new Error('OpenAPI Changelog Error: `runId` not available in S3 index.json!');

    let changelogData = {
      index,
    };
    try {
      const receivedChangelogData = await fetchChangelogData(runId, versions);
      changelogData = { ...changelogData, ...receivedChangelogData };
      await db.stitchInterface.updateOAChangelogMetadata(index);
    } catch (error) {
      /* If any error occurs, fetch last successful metadata and build changelog node */
      const lastSuccessfulIndex = await db.stitchInterface.fetchDocument(
        'openapi_changelog',
        'atlas_admin_metadata',
        {}
      );
      const { runId: lastRunId, versions: lastVersions } = lastSuccessfulIndex;
      const receivedChangelogData = fetchChangelogData(lastRunId, lastVersions);
      changelogData = { index: lastSuccessfulIndex, ...receivedChangelogData };
    }

    /* Create Node for useStaticQuery with all Changelog data */
    createNode({
      children: [],
      id: createNodeId('changelogData'),
      internal: {
        contentDigest: createContentDigest(changelogData),
        type: 'ChangelogData',
      },
      parent: null,
      changelogData: changelogData,
    });
  } catch (e) {
    console.error('Error while fetching OpenAPI Changelog data from S3');
    console.error(e);

    /* Create empty Node for useStaticQuery to ensure successful build */
    createNode({
      children: [],
      id: createNodeId('changelogData'),
      internal: {
        contentDigest: createContentDigest({}),
        type: 'ChangelogData',
      },
      parent: null,
      changelogData: {},
    });
  }
};

exports.sourceNodes = async ({ actions, createContentDigest, createNodeId }) => {
  let hasOpenAPIChangelog = false;
  const { createNode } = actions;

  // setup and validate env variables
  const envResults = validateEnvVariables(manifestMetadata);
  if (envResults.error) {
    throw Error(envResults.message);
  }

  // wait to connect to stitch

  if (siteMetadata.manifestPath) {
    console.log('Loading documents from manifest');
    db = manifestDocumentDatabase;
  } else {
    console.log('Loading documents from stitch');
    db = stitchDocumentDatabase;
  }

  await db.connect();

  const documents = await db.getDocuments();

  if (documents.length === 0) {
    console.error(
      'Snooty could not find AST entries for the',
      siteMetadata.parserBranch,
      'branch of',
      siteMetadata.project,
      'within',
      siteMetadata.database
    );
    process.exit(1);
  }
  const pageIdPrefix = constructPageIdPrefix(siteMetadata);
  documents.forEach((doc) => {
    const { page_id, ...rest } = doc;
    RESOLVED_REF_DOC_MAPPING[page_id.replace(`${pageIdPrefix}/`, '')] = rest;
  });

  // Identify page documents and parse each document for images
  Object.entries(RESOLVED_REF_DOC_MAPPING).forEach(([key, val]) => {
    const pageNode = getNestedValue(['ast', 'children'], val);
    const filename = getNestedValue(['filename'], val) || '';

    // Parse each document before pages are created via createPage
    // to remove all positions fields as it is only used in the parser for logging
    removeNestedValue('position', 'children', [val?.ast]);

    if (pageNode) {
      val.static_assets.forEach((asset) => {
        const checksum = asset.checksum;
        if (assets.has(checksum)) {
          assets.set(checksum, new Set([...assets.get(checksum), asset.key]));
        } else {
          assets.set(checksum, new Set([asset.key]));
        }
      });
    }

    if (filename.endsWith('.txt') && !manifestMetadata.openapi_pages?.[key]) {
      PAGES.push(key);
    }
    if (val?.ast?.options?.template === 'changelog') hasOpenAPIChangelog = true;
  });

  // Get all MongoDB products for the sidenav
  const products = await db.fetchAllProducts(siteMetadata.database);
  products.forEach((product) => {
    const url = baseUrl(product.baseUrl + product.slug);

    createNode({
      children: [],
      id: createNodeId(`Product-${product.title}`),
      internal: {
        contentDigest: createContentDigest(product),
        type: 'Product',
      },
      parent: null,
      title: product.title,
      url,
    });
  });

  await createRemoteMetadataNode({ createNode, createNodeId, createContentDigest });
  if (siteMetadata.project === 'cloud-docs' && hasOpenAPIChangelog)
    await createOpenAPIChangelogNode({ createNode, createNodeId, createContentDigest });

  await saveAssetFiles(assets, db);
  const { static_files: staticFiles, ...metadataMinusStatic } = await db.getMetadata();

  const { parentPaths, slugToTitle } = metadataMinusStatic;
  if (parentPaths) {
    transformBreadcrumbs(parentPaths, slugToTitle);
  }

  //Save files in the static_files field of metadata document, including intersphinx inventories
  if (staticFiles) {
    await saveStaticFiles(staticFiles);
  }

  createNode({
    children: [],
    id: createNodeId('metadata'),
    internal: {
      contentDigest: createContentDigest(metadataMinusStatic),
      type: 'SnootyMetadata',
    },
    parent: null,
    metadata: metadataMinusStatic,
  });
};

exports.createPages = async ({ actions }) => {
  const { createPage } = actions;

  let repoBranches = null;
  try {
    const repoInfo = await db.stitchInterface.fetchRepoBranches();
    let errMsg;

    if (!repoInfo) {
      errMsg = `Repo data for ${siteMetadata.project} could not be found.`;
    }

    // We should expect the number of branches for a docs repo to be 1 or more.
    if (!repoInfo.branches?.length) {
      errMsg = `No version information found for ${siteMetadata.project}`;
    }

    if (errMsg) {
      throw errMsg;
    }

    // Handle inconsistent env names. Default to 'dotcomprd' when possible since this is what we will most likely use.
    // dotcom environments seem to be consistent.
    let envKey = siteMetadata.snootyEnv;
    if (!envKey || envKey === 'development') {
      envKey = 'dotcomprd';
    } else if (envKey === 'production') {
      envKey = 'prd';
    } else if (envKey === 'staging') {
      envKey = 'stg';
    }

    // We're overfetching data here. We only need branches and prefix at the least
    repoBranches = {
      branches: repoInfo.branches,
      siteBasePrefix: repoInfo.prefix[envKey],
    };

    if (repoInfo.groups?.length > 0) {
      repoBranches.groups = repoInfo.groups;
    }
  } catch (err) {
    console.error(err);
    throw err;
  }

  return new Promise((resolve, reject) => {
    PAGES.forEach((page) => {
      const pageNodes = RESOLVED_REF_DOC_MAPPING[page]?.ast;
      const slug = getPageSlug(page);

      // TODO: Gatsby v4 will enable code splitting automatically. Delete duplicate component, add conditional for consistent-nav UnifiedFooter
      const isFullBuild =
        siteMetadata.snootyEnv !== 'production' || process.env.PREVIEW_BUILD_ENABLED?.toUpperCase() !== 'TRUE';
      const mainComponentRelativePath = `../../src/components/DocumentBody${isFullBuild ? '' : 'Preview'}.js`;

      if (RESOLVED_REF_DOC_MAPPING[page] && Object.keys(RESOLVED_REF_DOC_MAPPING[page]).length > 0) {
        createPage({
          path: assertTrailingSlash(slug),
          component: path.resolve(__dirname, mainComponentRelativePath),
          context: {
            slug,
            repoBranches,
            associatedReposInfo,
            isAssociatedProduct,
            template: pageNodes?.options?.template,
            page: pageNodes,
          },
        });
      }
    });

    resolve();
  });
};

// Prevent errors when running gatsby build caused by browser packages run in a node environment.
exports.onCreateWebpackConfig = ({ stage, loaders, plugins, actions }) => {
  if (stage === 'build-html') {
    actions.setWebpackConfig({
      module: {
        rules: [
          {
            test: /mongodb-stitch-browser-sdk/,
            use: loaders.null(),
          },
        ],
      },
    });
  }

  const providePlugins = {
    Buffer: ['buffer', 'Buffer'],
    process: require.resolve('./stubs/process.js'),
  };

  const fallbacks = { stream: require.resolve('stream-browserify'), buffer: require.resolve('buffer/') };

  actions.setWebpackConfig({
    plugins: [plugins.provide(providePlugins)],
    resolve: {
      fallback: fallbacks,
      alias: {
        process: 'process/browser',
      },
    },
  });
};

// Remove type inference, as our schema is too ambiguous for this to be useful.
// https://www.gatsbyjs.com/docs/scaling-issues/#switch-off-type-inference-for-sitepagecontext
exports.createSchemaCustomization = ({ actions }) => {
  actions.createTypes(`
    type SitePage implements Node @dontInfer {
      path: String!
    }

    type SnootyMetadata implements Node @dontInfer {
      metadata: JSON!
    }

    type RemoteMetadata implements Node @dontInfer {
      remoteMetadata: JSON
    }

    type ChangelogData implements Node @dontInfer {
      changelogData: JSON
    }
  `);
};
