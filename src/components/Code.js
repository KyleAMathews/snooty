import React, { Component } from 'react';
import ReactDOMServer from 'react-dom/server';
import PropTypes from 'prop-types';
import Highlight from 'react-highlight';
import { reportAnalytics } from '../utils/report-analytics';
import 'highlight.js/styles/a11y-light.css';
import codeStyle from '../styles/code.module.css';
import URIText from './URIWriter/URIText';
import {
  URI_PLACEHOLDER,
  USERNAME_PLACEHOLDER,
  URISTRING_SHELL_PLACEHOLDER,
  URISTRING_SHELL_NOUSER_PLACEHOLDER,
} from './URIWriter/constants';

const URI_PLACEHOLDERS = [
  URI_PLACEHOLDER,
  USERNAME_PLACEHOLDER,
  URISTRING_SHELL_PLACEHOLDER,
  URISTRING_SHELL_NOUSER_PLACEHOLDER,
];

export default class Code extends Component {
  constructor(props) {
    super(props);
    this.state = {
      showCopyButton: true,
      copied: false,
    };
  }

  componentDidMount() {
    this.isCopyButtonEnabled();
  }

  // this function determines if we can programmatically copy the code
  // blocks via the copy button because some browsers disable for security reasons
  // https://stackoverflow.com/a/34046084
  isCopyButtonEnabled = () => {
    if (!window || !window.navigator || !window.navigator.clipboard) {
      const userAgent = window.navigator.userAgent;
      // iOS Safari does not support execCommand('copy')
      if (userAgent.includes('iPhone') && userAgent.includes('Safari')) {
        this.setState({
          showCopyButton: false,
        });
      }
    }
  };

  // toggle copied bubble above code button
  toggleCopiedBubble = () => {
    this.setState({
      copied: true,
    });
    // hide after some time passes
    setTimeout(() => {
      this.setState({
        copied: false,
      });
    }, 1500);
  };

  // clicking copy button for code blocks
  handleCopyClick = code => {
    // async copy method
    if (window && window.navigator && window.navigator.clipboard) {
      window.navigator.clipboard.writeText(code).then(() => {
        this.toggleCopiedBubble();
      });
    } else {
      // move text to temporary textarea element
      const tempElement = document.createElement('textarea');
      tempElement.style.position = 'fixed';
      document.body.appendChild(tempElement);
      tempElement.value = code;
      tempElement.select();
      try {
        // attempt to copy using secondary method
        const copySuccessful = document.execCommand('copy');
        if (!copySuccessful) throw new Error('Failed to copy');
        this.toggleCopiedBubble();
      } catch (err) {
        console.error(err);
      } finally {
        document.body.removeChild(tempElement);
      }
    }
  };

  htmlDecode = input => {
    const doc = new DOMParser().parseFromString(input, 'text/html');
    return doc.documentElement.textContent;
  };

  render() {
    const { copied, showCopyButton } = this.state;
    const {
      nodeData: { value, lang },
      activeTabs: { cloud },
      uri: { cloudURI, localURI },
    } = this.props;
    let code = value;
    if (URI_PLACEHOLDERS.some(placeholder => code.includes(placeholder))) {
      const uri = cloud === 'cloud' ? cloudURI : localURI;
      code = ReactDOMServer.renderToString(<URIText value={code} activeDeployment={cloud} uri={uri} />);
      code = this.htmlDecode(code);
    }
    // TODO: when we move off docs-tools CSS, change the copy button from <a> to <button>
    return (
      <div className="button-code-block">
        <div className="button-row">
          {showCopyButton && (
            <a // eslint-disable-line jsx-a11y/anchor-is-valid, jsx-a11y/interactive-supports-focus
              className="code-button--copy code-button"
              role="button"
              onClick={() => {
                this.handleCopyClick(value);
                reportAnalytics('Codeblock Copied', {
                  code: value,
                });
              }}
            >
              copy
              <div
                className={`code-button__tooltip ${
                  copied ? 'code-button__tooltip--active' : 'code-button__tooltip--inactive'
                }`}
              >
                copied
              </div>
            </a>
          )}
        </div>
        <div className={`copyable-code-block notranslate highlight-${lang}`}>
          <div className="highlight">
            <Highlight className={`${lang} ${codeStyle.hljs}`}>{code}</Highlight>
          </div>
        </div>
      </div>
    );
  }
}

Code.propTypes = {
  nodeData: PropTypes.shape({
    value: PropTypes.string.isRequired,
  }).isRequired,
  activeTabs: PropTypes.shape({
    cloud: PropTypes.string,
  }).isRequired,
  uri: PropTypes.shape({
    atlasVersion: PropTypes.string,
    authSource: PropTypes.string,
    database: PropTypes.string,
    localEnv: PropTypes.string,
    hostlist: PropTypes.object,
    replicaSet: PropTypes.string,
    username: PropTypes.string,
  }),
};

Code.defaultProps = {
  uri: {
    cloudURI: undefined,
    localURI: undefined,
  },
};
