import { useState, useCallback, useEffect } from 'react';
import { useUser } from '../context/UserContext';

export type TourType = 'basic' | 'advanced';

function tourKey(type: TourType, userId: number): string {
  return `hasSeen_${type}_user_${userId}`;
}

export function useTour() {
  const { activeUserId } = useUser();
  // Default to null so the tour stays hidden during initial page load
  const [activeTour, setActiveTour] = useState<TourType | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  // Evaluate tour status ONLY after we have a confirmed active user
  useEffect(() => {
    if (!activeUserId || activeUserId === 0) return;

    const basicKey = tourKey('basic', activeUserId);
    const hasSeenBasic = localStorage.getItem(basicKey) === 'true';

    if (!hasSeenBasic) {
      setActiveTour('basic');
    }
  }, [activeUserId]);

  const finishTour = useCallback((type: TourType) => {
    if (!activeUserId) return;
    console.log(`[useTour] Marking ${type} tour as finished for user ${activeUserId}`);
    localStorage.setItem(tourKey(type, activeUserId), 'true');
    setActiveTour(null);
    setStepIndex(0);
  }, [activeUserId]);

  const startTour = useCallback((type: TourType) => {
    console.log(`[useTour] Manually starting ${type} tour`);
    setStepIndex(0);
    setActiveTour(type);
  }, []);

  return { activeTour, finishTour, startTour, stepIndex, setStepIndex };
}
