import React, { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import queryString from 'query-string';
import Button from '@leafygreen-ui/button';
import { css, cx } from '@leafygreen-ui/emotion';
import { getSiteUrl } from '../utils/get-site-url';
import { isBrowser } from '../utils/is-browser';
import { theme } from '../theme/docsTheme';
import Select from './Select';

const SELECT_WIDTH = '336px';

const selectStyle = css`
  margin-bottom: ${theme.size.medium};
  width: ${SELECT_WIDTH};

  @media ${theme.screenSize.upToSmall} {
    width: 100%;
  }
`;

const PROPERTY_NAME_MAPPING = {
  'atlas-open-service-broker': 'MongoDB Atlas Open Service Broker on Kubernetes',
  'atlas-cli': 'MongoDB Atlas CLI',
  'bi-connector': 'MongoDB Connector for BI',
  charts: 'MongoDB Charts',
  cloud: 'MongoDB Atlas',
  compass: 'MongoDB Compass',
  docs: 'MongoDB Server',
  drivers: 'MongoDB Drivers',
  'kafka-connector': 'MongoDB Kafka Connector',
  'kubernetes-operator': 'MongoDB Enterprise Kubernetes Operator',
  mongocli: 'MongoDB CLI',
  mongoid: 'Mongoid',
  mms: 'MongoDB Ops Manager',
  'ruby-driver': 'MongoDB Ruby Driver',
  'spark-connector': 'MongoDB Connector for Spark',
};

const fullProductName = (property) => {
  if (!property) return null;
  // Display full product name on product dropdown
  return PROPERTY_NAME_MAPPING[property.replace('_', '-')] || property;
};

const isPrimaryBranch = (version) => {
  return version === 'main' || version === 'master';
};

const prefixVersion = (version) => {
  if (!version) return null;
  // Display as "Version X" on menu if numeric version and remove v from version name
  const versionNumber = version.replace('v', '').split()[0];
  // if branch is 'master' or 'main', show as latest
  if (isPrimaryBranch(versionNumber)) {
    return 'latest';
  }
  return `Version ${versionNumber}`;
};

// An unversioned docs site defined as a product with a single
// option of 'master' or 'main'
const isVersioned = (versionOptions) => {
  return !(versionOptions.length === 1 && isPrimaryBranch(versionOptions[0]));
};

const DeprecatedVersionSelector = ({ metadata: { deprecated_versions: deprecatedVersions } }) => {
  const [product, setProduct] = useState('');
  const [version, setVersion] = useState('');
  const updateProduct = useCallback(({ value }) => {
    setProduct(value);
    setVersion('');
  }, []);
  const updateVersion = useCallback(({ value }) => setVersion(value), []);
  const buttonDisabled = !(product && version);

  useEffect(() => {
    if (isBrowser) {
      // Extract the value of 'site' query string from the page url to pre-select product
      const { site } = queryString.parse(window.location.search);
      if (site && Object.keys(deprecatedVersions).includes(site)) {
        setProduct(site);
      }
    }
  }, [deprecatedVersions]);

  const generateUrl = () => {
    // Our current LG button version has a bug where a disabled button with an href allows the disabled
    // button to be clickable. This logic can be removed when LG button is version >= 12.0.4.
    if (buttonDisabled) {
      return null;
    }

    const versionOptions = deprecatedVersions[product];
    const hostName = getSiteUrl(product);
    const versionName = isVersioned(versionOptions) ? version : '';
    return ['docs', 'mms', 'cloud-docs', 'atlas-cli'].includes(product)
      ? `${hostName}/${versionName}`
      : `${hostName}/${product}/${versionName}`;
  };

  const productChoices = deprecatedVersions
    ? Object.keys(deprecatedVersions).map((product) => ({
        text: fullProductName(product),
        value: product,
      }))
    : [];

  const versionChoices = deprecatedVersions[product]
    ? deprecatedVersions[product].map((version) => ({
        text: prefixVersion(version),
        value: version,
      }))
    : [];

  return (
    <>
      <Select
        className={cx(selectStyle)}
        choices={productChoices}
        defaultText="Product"
        label="Select a Product"
        onChange={updateProduct}
        value={product}
      />
      <Select
        className={cx(selectStyle)}
        choices={versionChoices}
        defaultText="Version"
        disabled={product === ''}
        label="Select a Version"
        onChange={updateVersion}
        value={version}
      />
      <Button variant="primary" title="View Documentation" href={generateUrl()} disabled={buttonDisabled}>
        View Documentation
      </Button>
    </>
  );
};

DeprecatedVersionSelector.propTypes = {
  metadata: PropTypes.object.isRequired,
};

export default DeprecatedVersionSelector;
