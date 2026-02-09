import './index.css';

import SidePanel from './App.tsx';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<SidePanel />
	</StrictMode>
);
