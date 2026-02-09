import './index.css';

import PopUp from './App.tsx';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<PopUp />
	</StrictMode>
);
