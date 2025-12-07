import React from 'react';
import ReactDOM from 'react-dom';
import './reset.css';
import * as serviceWorker from './serviceWorker';

// Import DebugLogger early to ensure startup banner shows
import './neural/DebugLogger';

import App from './App';

ReactDOM.render(<App />, document.getElementById('root'));

serviceWorker.register({
  onUpdate() {
  },
});
