import './index.css';

import Options from './App.tsx';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<Options />
	</StrictMode>
);
