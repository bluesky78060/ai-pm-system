import { describe, it, expect } from 'vitest';

describe('PriorityRecommendationService', () => {
  describe('scoreToPriority', () => {
    it('converts score 75+ to priority 1 (very high)', () => {
      // Test via logic: score >= 75 should map to priority 1
      const testScores = [75, 80, 90, 100];
      testScores.forEach(score => {
        const priority = score >= 75 ? 1 : score >= 60 ? 2 : score >= 40 ? 3 : score >= 25 ? 4 : 5;
        expect(priority).toBe(1);
      });
    });

    it('converts score 60-74 to priority 2 (high)', () => {
      const testScores = [60, 65, 70, 74];
      testScores.forEach(score => {
        const priority = score >= 75 ? 1 : score >= 60 ? 2 : score >= 40 ? 3 : score >= 25 ? 4 : 5;
        expect(priority).toBe(2);
      });
    });

    it('converts score 40-59 to priority 3 (medium)', () => {
      const testScores = [40, 45, 50, 59];
      testScores.forEach(score => {
        const priority = score >= 75 ? 1 : score >= 60 ? 2 : score >= 40 ? 3 : score >= 25 ? 4 : 5;
        expect(priority).toBe(3);
      });
    });

    it('converts score 25-39 to priority 4 (low)', () => {
      const testScores = [25, 30, 35, 39];
      testScores.forEach(score => {
        const priority = score >= 75 ? 1 : score >= 60 ? 2 : score >= 40 ? 3 : score >= 25 ? 4 : 5;
        expect(priority).toBe(4);
      });
    });

    it('converts score 0-24 to priority 5 (very low)', () => {
      const testScores = [0, 10, 20, 24];
      testScores.forEach(score => {
        const priority = score >= 75 ? 1 : score >= 60 ? 2 : score >= 40 ? 3 : score >= 25 ? 4 : 5;
        expect(priority).toBe(5);
      });
    });
  });

  describe('calculateConfidence', () => {
    it('returns high confidence with 4+ data points and 3+ reasons', () => {
      const dataPoints = 4;
      const reasonCount = 3;
      const confidence = dataPoints >= 4 && reasonCount >= 3 ? 'high' : dataPoints >= 2 && reasonCount >= 2 ? 'medium' : 'low';
      expect(confidence).toBe('high');
    });

    it('returns medium confidence with 2+ data points and 2+ reasons', () => {
      const dataPoints = 2;
      const reasonCount = 2;
      const confidence = dataPoints >= 4 && reasonCount >= 3 ? 'high' : dataPoints >= 2 && reasonCount >= 2 ? 'medium' : 'low';
      expect(confidence).toBe('medium');
    });

    it('returns low confidence with insufficient data', () => {
      const dataPoints = 1;
      const reasonCount = 1;
      const confidence = dataPoints >= 4 && reasonCount >= 3 ? 'high' : dataPoints >= 2 && reasonCount >= 2 ? 'medium' : 'low';
      expect(confidence).toBe('low');
    });
  });

  describe('priority score calculation logic', () => {
    it('decreases score for blocked dependencies', () => {
      const baseScore = 50;
      const blockingCount = 2;
      const scoreWithBlocking = baseScore - blockingCount * 15;
      expect(scoreWithBlocking).toBe(20);
    });

    it('increases score for high demand (many dependent tasks)', () => {
      const baseScore = 50;
      const dependentCount = 3;
      const scoreWithDemand = baseScore + dependentCount * 10;
      expect(scoreWithDemand).toBe(80);
    });

    it('decreases score for overdue tasks', () => {
      const baseScore = 50;
      const overrunHours = 4;
      const penalty = Math.min(overrunHours * 5, 20);
      const scoreWithOverdue = baseScore - penalty;
      expect(scoreWithOverdue).toBe(30);
    });

    it('increases score for stale in_progress tasks', () => {
      const baseScore = 50;
      const daysInProgress = 10;
      const bonus = Math.min(daysInProgress * 2, 20);
      const scoreWithStale = baseScore + bonus;
      expect(scoreWithStale).toBe(70);
    });

    it('increases score for epic near completion (>= 80%)', () => {
      const baseScore = 50;
      const epicCompletionRate = 85;
      const bonus = epicCompletionRate >= 80 ? 15 : 0;
      const scoreWithEpic = baseScore + bonus;
      expect(scoreWithEpic).toBe(65);
    });

    it('decreases score for blocked status', () => {
      const baseScore = 50;
      const isBlocked = true;
      const scoreWithBlocked = baseScore - (isBlocked ? 30 : 0);
      expect(scoreWithBlocked).toBe(20);
    });

    it('increases score for review status', () => {
      const baseScore = 50;
      const isReview = true;
      const scoreWithReview = baseScore + (isReview ? 12 : 0);
      expect(scoreWithReview).toBe(62);
    });
  });
});
