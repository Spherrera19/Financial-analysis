import { useState, useCallback } from 'react';
import { useUser } from '../context/UserContext';

export type TourType = 'basic' | 'advanced';

function tourKey(type: TourType, userId: number): string {
  return `hasSeen_${type}_user_${userId}`;
}

export interface TourState {
  activeTour: TourType | null;
}

export function useTour() {
  const { activeUserId } = useUser();

  const [activeTour, setActiveTour] = useState<TourType | null>(() => {
    const basicKey = tourKey('basic', activeUserId);
    return localStorage.getItem(basicKey) !== 'true' ? 'basic' : null;
  });

  const [stepIndex, setStepIndex] = useState(0);

  const finishTour = useCallback((type: TourType) => {
    localStorage.setItem(tourKey(type, activeUserId), 'true');
    setActiveTour(null);
    setStepIndex(0);
  }, [activeUserId]);

  const startTour = useCallback((type: TourType) => {
    setStepIndex(0);
    setActiveTour(type);
  }, []);

  return { activeTour, finishTour, startTour, stepIndex, setStepIndex };
}
