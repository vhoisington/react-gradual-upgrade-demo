/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import React from 'react';
import {useContext, useMemo, useRef, useLayoutEffect, useEffect} from 'react';
import {useLocation, useNavigate} from 'react-router-dom';
import {ReactReduxContext} from 'react-redux';

import ThemeContext from './shared/ThemeContext';

let rendererModule = {
  status: 'pending',
  promise: null,
  result: null,
};

export default function lazyLegacyRoot(getLegacyComponent) {
  let componentModule = {
    status: 'pending',
    promise: null,
    result: null,
  };

  return function Wrapper(props) {
    const createLegacyRoot = readModule(rendererModule, () =>
      import('../legacy/createLegacyRoot')
    ).default;
    const Component = readModule(componentModule, getLegacyComponent).default;
    const containerRef = useRef(null);
    const rootRef = useRef(null);

    // Populate every contexts we want the legacy subtree to see.
    // Then in src/legacy/createLegacyRoot we will apply them.
    const theme = useContext(ThemeContext);
    const location = useLocation();
    const navigate = useNavigate();
    
    const listenersRef = useRef(new Set());
    const blockersRef = useRef(new Set());

    useEffect(() => {
      listenersRef.current.forEach(listener => {
        try {
          listener(location, 'POP');
        } catch (error) {
          console.error('History listener error:', error);
        }
      });
    }, [location]);

    const router = useMemo(() => {
      try {
        const history = {
          length: window.history.length,
          action: 'POP',
          location: {
            pathname: location.pathname,
            search: location.search,
            hash: location.hash,
            state: location.state,
            key: location.key || 'default'
          },
          push: (path, state) => {
            try {
              if (typeof path === 'string') {
                navigate(path, { state });
              } else {
                navigate(path.pathname + (path.search || '') + (path.hash || ''), { 
                  state: path.state || state 
                });
              }
            } catch (error) {
              console.error('History push error:', error);
            }
          },
          replace: (path, state) => {
            try {
              if (typeof path === 'string') {
                navigate(path, { replace: true, state });
              } else {
                navigate(path.pathname + (path.search || '') + (path.hash || ''), { 
                  replace: true, 
                  state: path.state || state 
                });
              }
            } catch (error) {
              console.error('History replace error:', error);
            }
          },
          go: (n) => {
            try {
              window.history.go(n);
            } catch (error) {
              console.error('History go error:', error);
            }
          },
          goBack: () => {
            try {
              window.history.back();
            } catch (error) {
              console.error('History goBack error:', error);
            }
          },
          goForward: () => {
            try {
              window.history.forward();
            } catch (error) {
              console.error('History goForward error:', error);
            }
          },
          listen: (listener) => {
            if (typeof listener !== 'function') {
              console.warn('History listen: listener must be a function');
              return () => {};
            }
            listenersRef.current.add(listener);
            return () => {
              listenersRef.current.delete(listener);
            };
          },
          block: (blocker) => {
            if (typeof blocker !== 'function') {
              console.warn('History block: blocker must be a function');
              return () => {};
            }
            blockersRef.current.add(blocker);
            return () => {
              blockersRef.current.delete(blocker);
            };
          },
          createHref: (location) => {
            try {
              if (typeof location === 'string') return location;
              return location.pathname + (location.search || '') + (location.hash || '');
            } catch (error) {
              console.error('History createHref error:', error);
              return '/';
            }
          }
        };

        return {
          history,
          location: history.location,
          match: {
            params: {},
            isExact: true,
            path: location.pathname,
            url: location.pathname
          }
        };
      } catch (error) {
        console.error('Context bridging error:', error);
        return {
          history: {
            length: 1,
            action: 'POP',
            location: { pathname: '/', search: '', hash: '', state: null, key: 'default' },
            push: () => {},
            replace: () => {},
            go: () => {},
            goBack: () => {},
            goForward: () => {},
            listen: () => () => {},
            block: () => () => {},
            createHref: () => '/'
          },
          location: { pathname: '/', search: '', hash: '', state: null, key: 'default' },
          match: { params: {}, isExact: true, path: '/', url: '/' }
        };
      }
    }, [location, navigate]);
    
    const reactRedux = useContext(ReactReduxContext);
    const context = useMemo(
      () => ({
        theme,
        router,
        reactRedux,
      }),
      [theme, router, reactRedux]
    );

    // Create/unmount.
    useLayoutEffect(() => {
      if (!rootRef.current) {
        rootRef.current = createLegacyRoot(containerRef.current);
      }
      const root = rootRef.current;
      return () => {
        root.unmount();
      };
    }, [createLegacyRoot]);

    // Mount/update.
    useLayoutEffect(() => {
      if (rootRef.current) {
        rootRef.current.render(Component, props, context);
      }
    }, [Component, props, context]);

    return <div style={{display: 'contents'}} ref={containerRef} />;
  };
}

// This is similar to React.lazy, but implemented manually.
// We use this to Suspend rendering of this component until
// we fetch the component and the legacy React to render it.
function readModule(record, createPromise) {
  if (record.status === 'fulfilled') {
    return record.result;
  }
  if (record.status === 'rejected') {
    throw record.result;
  }
  if (!record.promise) {
    record.promise = createPromise().then(
      value => {
        if (record.status === 'pending') {
          record.status = 'fulfilled';
          record.promise = null;
          record.result = value;
        }
      },
      error => {
        if (record.status === 'pending') {
          record.status = 'rejected';
          record.promise = null;
          record.result = error;
        }
      }
    );
  }
  throw record.promise;
}
