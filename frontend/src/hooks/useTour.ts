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

  // On mount, check if the basic tour has been seen for this user.
  // Auto-start basic tour if not seen yet.
  const [activeTour, setActiveTour] = useState<TourType | null>(() => {
    const basicKey = tourKey('basic', activeUserId);
    return localStorage.getItem(basicKey) !== 'true' ? 'basic' : null;
  });

  const finishTour = useCallback((type: TourType) => {
    localStorage.setItem(tourKey(type, activeUserId), 'true');
    setActiveTour(null);
  }, [activeUserId]);

  const startTour = useCallback((type: TourType) => {
    setActiveTour(type);
  }, []);

  return { activeTour, finishTour, startTour };
}
