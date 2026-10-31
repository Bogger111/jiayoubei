import React from 'react';
import {createRoot} from 'react-dom/client';
import CompetitionShowcase from '../../app/components/CompetitionShowcase';
import '../../app/showcase.css';
createRoot(document.getElementById('root')!).render(<CompetitionShowcase standalone/>);
